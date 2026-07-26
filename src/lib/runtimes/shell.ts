// A small POSIX-ish shell over an in-memory filesystem.
//
// Grown out of the Git module, where the learner needed to make files worth
// committing. The same machinery is what a Linux course needs — a working
// directory, pipes, redirection, exit codes — so it lives here and both modules
// register their own commands into it.
//
// What this is NOT: a kernel. There are no processes, no users, no devices, and
// no syscalls. Permissions are enforced by these commands rather than by
// anything underneath them, which is honest for teaching what the bits MEAN and
// dishonest if a lesson claims it is a security boundary. The runtime notes say
// so, so the generator does not write a lesson that pretends otherwise.
//
// Commands are plain functions: text in, text out. That single shape is what
// makes `cat notes.txt | grep error | wc -l` work without any command knowing a
// pipe exists.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Fs = any;

export type ShellCtx = {
  fs: Fs;
  pfs: any;
  /** Absolute, always starts with "/" and never ends with one (except root). */
  cwd: string;
  env: Record<string, string>;
  /** Resolve a user-typed path against the working directory. */
  resolve(p: string): string;
  readFile(p: string): Promise<string>;
  writeFile(p: string, content: string, mode?: number): Promise<void>;
  stat(p: string): Promise<any | null>;
  /** Set by `cd`; the shell picks it up after each command. */
  nextCwd?: string;
};

/** Thrown by a command that failed the way a real one would. */
export class ShellError extends Error {
  constructor(message: string, public code = 1) {
    super(message);
  }
}

export type CommandFn = (args: string[], ctx: ShellCtx, stdin: string) => Promise<string> | string;

// ---------------------------------------------------------------- path helpers

export function normalize(p: string): string {
  const parts = p.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

export function basename(p: string): string {
  const n = normalize(p);
  return n.slice(n.lastIndexOf("/") + 1) || "/";
}

export function dirname(p: string): string {
  const n = normalize(p);
  const i = n.lastIndexOf("/");
  return i <= 0 ? "/" : n.slice(0, i);
}

// ------------------------------------------------------------------- tokenizer

/** Words, honouring quotes and $VAR, plus the operators the shell acts on. */
function tokenize(line: string, env: Record<string, string>): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let had = false; // distinguishes an empty quoted string from no word at all

  const push = () => {
    if (cur || had) out.push(cur);
    cur = "";
    had = false;
  };

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "$") {
        const m = /^\$(\w+)/.exec(line.slice(i));
        if (m) {
          cur += env[m[1]] ?? "";
          i += m[0].length - 1;
        } else cur += c;
      } else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      had = true;
      continue;
    }
    if (c === "$") {
      const m = /^\$(\w+|\?)/.exec(line.slice(i));
      if (m) {
        cur += env[m[1]] ?? "";
        i += m[0].length - 1;
        had = true;
        continue;
      }
    }
    if (/\s/.test(c)) {
      push();
      continue;
    }
    // Operators are their own tokens even when written without spaces.
    if (c === "|" || c === ">" || c === "<" || c === ";" || c === "&") {
      const two = line.slice(i, i + 2);
      if (two === ">>" || two === "&&" || two === "||") {
        push();
        out.push(two);
        i++;
        continue;
      }
      push();
      out.push(c);
      continue;
    }
    cur += c;
  }
  push();
  return out;
}

// -------------------------------------------------------------------- the shell

export type Shell = {
  run(script: string, onLine: (kind: "log" | "error", text: string) => void): Promise<void>;
  ctx: ShellCtx;
};

export function createShell(opts: {
  fs: Fs;
  commands: Record<string, CommandFn>;
  cwd?: string;
  env?: Record<string, string>;
}): Shell {
  const pfs = opts.fs.promises;

  const ctx: ShellCtx = {
    fs: opts.fs,
    pfs,
    cwd: opts.cwd ?? "/home/learner",
    env: { HOME: "/home/learner", USER: "learner", PWD: opts.cwd ?? "/home/learner", "?": "0", ...opts.env },
    resolve(p: string) {
      if (!p) return ctx.cwd;
      if (p === "~") return ctx.env.HOME;
      if (p.startsWith("~/")) return normalize(ctx.env.HOME + p.slice(1));
      return normalize(p.startsWith("/") ? p : `${ctx.cwd}/${p}`);
    },
    async readFile(p: string) {
      const data = await pfs.readFile(ctx.resolve(p), "utf8");
      return typeof data === "string" ? data : new TextDecoder().decode(data);
    },
    async writeFile(p: string, content: string, mode?: number) {
      await pfs.writeFile(ctx.resolve(p), content, mode === undefined ? "utf8" : { encoding: "utf8", mode });
    },
    async stat(p: string) {
      try {
        return await pfs.stat(ctx.resolve(p));
      } catch {
        return null;
      }
    },
  };

  /** One command with its arguments, after operators have been split off. */
  type Simple = { argv: string[]; redirect?: { file: string; append: boolean }; stdinFile?: string };

  function parsePipeline(tokens: string[]): Simple[] {
    const stages: Simple[] = [];
    let argv: string[] = [];
    let redirect: Simple["redirect"];
    let stdinFile: string | undefined;
    const flush = () => {
      if (argv.length) stages.push({ argv, redirect, stdinFile });
      argv = [];
      redirect = undefined;
      stdinFile = undefined;
    };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === "|") flush();
      else if (t === ">" || t === ">>") redirect = { file: tokens[++i], append: t === ">>" };
      else if (t === "<") stdinFile = tokens[++i];
      else argv.push(t);
    }
    flush();
    return stages;
  }

  async function runPipeline(tokens: string[], emit: (k: "log" | "error", t: string) => void): Promise<number> {
    const stages = parsePipeline(tokens);
    let stdin = "";
    let status = 0;

    for (let s = 0; s < stages.length; s++) {
      const { argv, redirect, stdinFile } = stages[s];
      const name = argv[0];
      const fn = opts.commands[name];
      if (!fn) {
        emit("error", `${name}: command not found`);
        return 127;
      }
      if (stdinFile) {
        try {
          stdin = await ctx.readFile(stdinFile);
        } catch {
          emit("error", `${name}: ${stdinFile}: No such file or directory`);
          return 1;
        }
      }

      let output = "";
      try {
        output = (await fn(argv.slice(1), ctx, stdin)) || "";
        status = 0;
      } catch (e) {
        if (e instanceof ShellError) {
          emit("error", e.message);
          status = e.code;
        } else {
          emit("error", `${name}: ${(e as Error).message}`);
          status = 1;
        }
        // A failed stage stops the pipeline, as a shell's `pipefail` would.
        return status;
      }
      if (ctx.nextCwd) {
        ctx.cwd = ctx.nextCwd;
        ctx.env.PWD = ctx.cwd;
        ctx.nextCwd = undefined;
      }

      const last = s === stages.length - 1;
      if (redirect) {
        const prev = redirect.append ? await ctx.readFile(redirect.file).catch(() => "") : "";
        await ctx.writeFile(redirect.file, prev + output);
        stdin = "";
      } else if (last) {
        for (const line of output.replace(/\n$/, "").split("\n")) {
          if (output !== "") emit("log", line);
        }
      } else {
        stdin = output;
      }
    }
    return status;
  }

  return {
    ctx,
    async run(script, onLine) {
      const emit = (kind: "log" | "error", text: string) => onLine(kind, text);

      for (const rawLine of script.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        // Split on ; && || while keeping the operator that joined them.
        const tokens = tokenize(line, ctx.env);
        let start = 0;
        let joiner: ";" | "&&" | "||" = ";";
        for (let i = 0; i <= tokens.length; i++) {
          const t = tokens[i];
          if (i !== tokens.length && t !== ";" && t !== "&&" && t !== "||") continue;
          const segment = tokens.slice(start, i);
          const prevStatus = Number(ctx.env["?"] ?? "0");
          const skip = (joiner === "&&" && prevStatus !== 0) || (joiner === "||" && prevStatus === 0);
          if (segment.length && !skip) {
            const status = await runPipeline(segment, emit);
            ctx.env["?"] = String(status);
          }
          joiner = (t as ";" | "&&" | "||") ?? ";";
          start = i + 1;
        }
      }
    },
  };
}
