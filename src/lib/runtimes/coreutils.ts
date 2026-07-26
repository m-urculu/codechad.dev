// The commands a first Linux course actually uses.
//
// Each is text in, text out (see shell.ts), which is the whole reason
// `cat log.txt | grep error | wc -l` works without any of them knowing what a
// pipe is — the same property that makes the real ones composable.
//
// Behaviour is matched to GNU coreutils where a lesson could notice: `wc -l`
// counts newlines, `sort` is lexicographic unless -n, `grep` exits 1 when it
// matches nothing, `rm` on a directory refuses without -r. Flags nobody teaches
// in a first course are left out rather than half-implemented.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShellError, basename, dirname, type CommandFn, type ShellCtx } from "./shell";

const lines = (s: string) => s.replace(/\n$/, "").split("\n");
const flags = (args: string[]) => args.filter((a) => a.startsWith("-") && a !== "-");
const operands = (args: string[]) => args.filter((a) => !a.startsWith("-") || a === "-");
/**
 * Operands, skipping flags that consume the next token.
 *
 * Without this `head -n 1 file` reads "1" as a second file and reports
 * "head: 1: No such file or directory" — which is how it failed the first time.
 */
const operandsExcept = (args: string[], valueFlags: string[]) => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valueFlags.includes(a)) { i++; continue; }
    if (a.startsWith("-") && a !== "-") continue;
    out.push(a);
  }
  return out;
};
const has = (args: string[], ...names: string[]) =>
  flags(args).some((f) => (f.startsWith("--") ? names.includes(f) : f.slice(1).split("").some((c) => names.includes("-" + c))));

/** `-n 5` or `-n5` or `-5`. */
function numFlag(args: string[], letter: string): number | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-" + letter) return Number(args[i + 1]);
    const m = new RegExp(`^-${letter}(\\d+)$`).exec(a);
    if (m) return Number(m[1]);
    const bare = /^-(\d+)$/.exec(a);
    if (bare && letter === "n") return Number(bare[1]);
  }
  return null;
}

/** Read the operands as files, or fall back to stdin — how every filter behaves. */
async function inputOf(args: string[], ctx: ShellCtx, stdin: string, cmd: string): Promise<string> {
  const files = operands(args);
  if (files.length === 0 || files[0] === "-") return stdin;
  const parts: string[] = [];
  for (const f of files) {
    const st = await ctx.stat(f);
    if (!st) throw new ShellError(`${cmd}: ${f}: No such file or directory`);
    if (st.isDirectory()) throw new ShellError(`${cmd}: ${f}: Is a directory`);
    parts.push(await ctx.readFile(f));
  }
  return parts.join("");
}

function modeString(st: any): string {
  const mode = typeof st.mode === "number" ? st.mode : 0o644;
  const bits = ["r", "w", "x"];
  let s = st.isDirectory() ? "d" : "-";
  for (let group = 2; group >= 0; group--) {
    for (let bit = 2; bit >= 0; bit--) {
      s += (mode >> (group * 3 + bit)) & 1 ? bits[2 - bit] : "-";
    }
  }
  return s;
}

export const coreutils: Record<string, CommandFn> = {
  // ---- navigation -------------------------------------------------------
  pwd: (_a, ctx) => ctx.cwd + "\n",

  cd: async (args, ctx) => {
    const target = ctx.resolve(operands(args)[0] ?? ctx.env.HOME);
    const st = await ctx.stat(target);
    if (!st) throw new ShellError(`cd: ${operands(args)[0]}: No such file or directory`);
    if (!st.isDirectory()) throw new ShellError(`cd: ${operands(args)[0]}: Not a directory`);
    ctx.nextCwd = target;
    return "";
  },

  ls: async (args, ctx) => {
    const targets = operands(args);
    const showAll = has(args, "-a", "--all");
    const long = has(args, "-l");
    const render = async (dir: string, names: string[]) => {
      const visible = names.filter((n) => showAll || !n.startsWith(".")).sort();
      if (!long) return visible.length ? visible.join("  ") + "\n" : "";
      const rows: string[] = [];
      for (const n of visible) {
        const st = await ctx.stat(`${dir}/${n}`);
        rows.push(`${modeString(st)} ${String(st?.size ?? 0).padStart(5)} ${n}`);
      }
      return rows.length ? rows.join("\n") + "\n" : "";
    };
    if (targets.length === 0) {
      const names: string[] = await ctx.pfs.readdir(ctx.cwd).catch(() => []);
      return render(ctx.cwd, names);
    }
    const out: string[] = [];
    for (const t of targets) {
      const p = ctx.resolve(t);
      const st = await ctx.stat(t);
      if (!st) throw new ShellError(`ls: cannot access '${t}': No such file or directory`);
      if (st.isDirectory()) out.push(await render(p, await ctx.pfs.readdir(p)));
      else if (long) out.push(`${modeString(st)} ${String(st.size ?? 0).padStart(5)} ${t}\n`);
      else out.push(t + "\n");
    }
    return out.join("");
  },

  // ---- reading and writing ----------------------------------------------
  echo: (args, ctx) => {
    void ctx;
    const noNewline = args[0] === "-n";
    const text = (noNewline ? args.slice(1) : args).join(" ");
    return noNewline ? text : text + "\n";
  },

  cat: async (args, ctx, stdin) => inputOf(args, ctx, stdin, "cat"),

  head: async (args, ctx, stdin) => {
    const n = numFlag(args, "n") ?? 10;
    return lines(await inputOf(operandsExcept(args, ["-n"]), ctx, stdin, "head")).slice(0, n).join("\n") + "\n";
  },

  tail: async (args, ctx, stdin) => {
    const n = numFlag(args, "n") ?? 10;
    return lines(await inputOf(operandsExcept(args, ["-n"]), ctx, stdin, "tail")).slice(-n).join("\n") + "\n";
  },

  wc: async (args, ctx, stdin) => {
    const text = await inputOf(args, ctx, stdin, "wc");
    const l = (text.match(/\n/g) || []).length;
    const w = text.split(/\s+/).filter(Boolean).length;
    const c = text.length;
    if (has(args, "-l")) return `${l}\n`;
    if (has(args, "-w")) return `${w}\n`;
    if (has(args, "-c")) return `${c}\n`;
    return `${l} ${w} ${c}\n`;
  },

  touch: async (args, ctx) => {
    for (const f of operands(args)) if (!(await ctx.stat(f))) await ctx.writeFile(f, "");
    return "";
  },

  mkdir: async (args, ctx) => {
    const parents = has(args, "-p", "--parents");
    for (const d of operands(args)) {
      const full = ctx.resolve(d);
      if (parents) {
        const parts = full.split("/").filter(Boolean);
        let at = "";
        for (const part of parts) {
          at += "/" + part;
          await ctx.pfs.mkdir(at).catch(() => {});
        }
      } else {
        if (await ctx.stat(d)) throw new ShellError(`mkdir: cannot create directory '${d}': File exists`);
        await ctx.pfs.mkdir(full).catch(() => {
          throw new ShellError(`mkdir: cannot create directory '${d}': No such file or directory`);
        });
      }
    }
    return "";
  },

  rmdir: async (args, ctx) => {
    for (const d of operands(args)) await ctx.pfs.rmdir(ctx.resolve(d));
    return "";
  },

  rm: async (args, ctx) => {
    const recursive = has(args, "-r", "-R", "--recursive");
    const force = has(args, "-f", "--force");
    const remove = async (p: string) => {
      const st = await ctx.stat(p);
      if (!st) {
        if (!force) throw new ShellError(`rm: cannot remove '${p}': No such file or directory`);
        return;
      }
      if (st.isDirectory()) {
        if (!recursive) throw new ShellError(`rm: cannot remove '${p}': Is a directory`);
        for (const name of await ctx.pfs.readdir(ctx.resolve(p))) await remove(`${ctx.resolve(p)}/${name}`);
        await ctx.pfs.rmdir(ctx.resolve(p));
      } else {
        await ctx.pfs.unlink(ctx.resolve(p));
      }
    };
    for (const p of operands(args)) await remove(p);
    return "";
  },

  cp: async (args, ctx) => {
    const paths = operands(args);
    const dest = paths[paths.length - 1];
    const recursive = has(args, "-r", "-R", "--recursive");
    const copy = async (from: string, to: string) => {
      const st = await ctx.stat(from);
      if (!st) throw new ShellError(`cp: cannot stat '${from}': No such file or directory`);
      if (st.isDirectory()) {
        if (!recursive) throw new ShellError(`cp: -r not specified; omitting directory '${from}'`);
        await ctx.pfs.mkdir(ctx.resolve(to)).catch(() => {});
        for (const name of await ctx.pfs.readdir(ctx.resolve(from))) await copy(`${from}/${name}`, `${to}/${name}`);
      } else {
        await ctx.writeFile(to, await ctx.readFile(from));
      }
    };
    for (const src of paths.slice(0, -1)) {
      const destStat = await ctx.stat(dest);
      await copy(src, destStat?.isDirectory() ? `${dest}/${basename(src)}` : dest);
    }
    return "";
  },

  mv: async (args, ctx) => {
    const paths = operands(args);
    const dest = paths[paths.length - 1];
    for (const src of paths.slice(0, -1)) {
      const destStat = await ctx.stat(dest);
      const to = destStat?.isDirectory() ? `${ctx.resolve(dest)}/${basename(src)}` : ctx.resolve(dest);
      await ctx.pfs.rename(ctx.resolve(src), to);
    }
    return "";
  },

  // ---- filters ----------------------------------------------------------
  grep: async (args, ctx, stdin) => {
    const rest = operands(args);
    const pattern = rest[0];
    if (pattern === undefined) throw new ShellError("usage: grep PATTERN [FILE]...");
    const files = rest.slice(1);
    const text = files.length ? await inputOf(files, ctx, stdin, "grep") : stdin;
    const re = new RegExp(pattern, has(args, "-i", "--ignore-case") ? "i" : "");
    const invert = has(args, "-v", "--invert-match");
    const numbered = has(args, "-n", "--line-number");
    const kept: string[] = [];
    lines(text).forEach((line, i) => {
      if (re.test(line) !== invert) kept.push(numbered ? `${i + 1}:${line}` : line);
    });
    if (has(args, "-c", "--count")) return `${kept.length}\n`;
    // grep says "nothing matched" with an exit code, and pipelines depend on it.
    if (kept.length === 0) throw new ShellError("", 1);
    return kept.join("\n") + "\n";
  },

  sort: async (args, ctx, stdin) => {
    const text = await inputOf(args, ctx, stdin, "sort");
    const rows = lines(text).filter((l) => l !== "");
    rows.sort(has(args, "-n", "--numeric-sort") ? (a, b) => Number(a) - Number(b) : (a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (has(args, "-r", "--reverse")) rows.reverse();
    return rows.join("\n") + "\n";
  },

  uniq: async (args, ctx, stdin) => {
    const rows = lines(await inputOf(args, ctx, stdin, "uniq")).filter((l) => l !== "");
    const out: string[] = [];
    let last: string | null = null;
    let count = 0;
    const flush = () => {
      if (last === null) return;
      out.push(has(args, "-c", "--count") ? `${String(count).padStart(4)} ${last}` : last);
    };
    for (const row of rows) {
      if (row === last) count++;
      else {
        flush();
        last = row;
        count = 1;
      }
    }
    flush();
    return out.join("\n") + "\n";
  },

  cut: async (args, ctx, stdin) => {
    const delimIdx = args.findIndex((a) => a === "-d");
    const delim = delimIdx !== -1 ? args[delimIdx + 1] : "\t";
    const fieldsIdx = args.findIndex((a) => a === "-f");
    const fields = (fieldsIdx !== -1 ? args[fieldsIdx + 1] : "1").split(",").map((n) => Number(n) - 1);
    const rest = operandsExcept(args, ["-d", "-f"]);
    const text = await inputOf(rest, ctx, stdin, "cut");
    return lines(text).map((l) => fields.map((f) => l.split(delim)[f] ?? "").join(delim)).join("\n") + "\n";
  },

  tr: async (args, ctx, stdin) => {
    void ctx;
    const [from, to] = operands(args);
    if (!from || to === undefined) throw new ShellError("usage: tr SET1 SET2");
    const expand = (s: string) =>
      s.replace(/([a-z])-([a-z])|([A-Z])-([A-Z])|(\d)-(\d)/g, (_m, ...g) => {
        const [a, b] = g.filter(Boolean) as string[];
        let out = "";
        for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) out += String.fromCharCode(c);
        return out;
      });
    const src = expand(from);
    const dst = expand(to);
    return stdin.replace(/[\s\S]/g, (c) => {
      const i = src.indexOf(c);
      return i === -1 ? c : dst[Math.min(i, dst.length - 1)];
    });
  },

  find: async (args, ctx) => {
    const rest = operandsExcept(args, ["-name", "-type"]);
    const typedRoot = rest[0] ?? ".";
    const root = ctx.resolve(typedRoot);
    const nameIdx = args.indexOf("-name");
    const typeIdx = args.indexOf("-type");
    const namePattern = nameIdx !== -1 ? args[nameIdx + 1] : null;
    const wantType = typeIdx !== -1 ? args[typeIdx + 1] : null;
    const re = namePattern ? new RegExp("^" + namePattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$") : null;
    const found: string[] = [];
    const walk = async (p: string) => {
      const st = await ctx.stat(p);
      if (!st) return;
      const isDir = st.isDirectory();
      const matchesName = !re || re.test(basename(p));
      const matchesType = !wantType || (wantType === "d" ? isDir : !isDir);
      // Real find prints paths beneath the root exactly as the root was typed.
      if (matchesName && matchesType) found.push(p === root ? typedRoot : `${typedRoot.replace(/\/$/, "")}${p.slice(root.length)}`);
      if (isDir) for (const n of await ctx.pfs.readdir(p)) await walk(`${p}/${n}`);
    };
    await walk(root);
    return found.join("\n") + "\n";
  },

  // ---- permissions -------------------------------------------------------
  // Enforced by these commands, not by a kernel. Enough to teach what the bits
  // mean; not a security boundary, and the runtime notes say so.
  chmod: async (args, ctx) => {
    const [modeArg, ...targets] = operands(args);
    if (!modeArg || !targets.length) throw new ShellError("usage: chmod MODE FILE...");
    for (const t of targets) {
      const st = await ctx.stat(t);
      if (!st) throw new ShellError(`chmod: cannot access '${t}': No such file or directory`);
      let mode: number;
      if (/^[0-7]{3,4}$/.test(modeArg)) mode = parseInt(modeArg, 8);
      else {
        // u+x, go-w, a+r — the symbolic form a course teaches first.
        const m = /^([ugoa]*)([+-=])([rwx]+)$/.exec(modeArg);
        if (!m) throw new ShellError(`chmod: invalid mode: '${modeArg}'`);
        const [, whoRaw, op, permsRaw] = m;
        const who = whoRaw || "a";
        let bits = 0;
        if (permsRaw.includes("r")) bits |= 4;
        if (permsRaw.includes("w")) bits |= 2;
        if (permsRaw.includes("x")) bits |= 1;
        const groups = who === "a" ? [2, 1, 0] : [...who].map((c) => (c === "u" ? 2 : c === "g" ? 1 : 0));
        mode = typeof st.mode === "number" ? st.mode & 0o777 : 0o644;
        for (const g of groups) {
          const shifted = bits << (g * 3);
          if (op === "+") mode |= shifted;
          else if (op === "-") mode &= ~shifted;
          else mode = (mode & ~(7 << (g * 3))) | shifted;
        }
      }
      // lightning-fs has no chmod, so the mode rides along with a rewrite.
      if (st.isDirectory()) continue;
      await ctx.writeFile(t, await ctx.readFile(t), mode);
    }
    return "";
  },

  stat: async (args, ctx) => {
    const out: string[] = [];
    for (const t of operands(args)) {
      const st = await ctx.stat(t);
      if (!st) throw new ShellError(`stat: cannot stat '${t}': No such file or directory`);
      out.push(`  File: ${t}`);
      out.push(`  Size: ${st.size ?? 0}\tType: ${st.isDirectory() ? "directory" : "regular file"}`);
      out.push(`Access: (${((st.mode ?? 0o644) & 0o777).toString(8).padStart(4, "0")}/${modeString(st)})`);
    }
    return out.join("\n") + "\n";
  },

  // ---- environment -------------------------------------------------------
  whoami: (_a, ctx) => ctx.env.USER + "\n",
  env: (_a, ctx) =>
    Object.entries(ctx.env)
      .filter(([k]) => k !== "?")
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  export: (args, ctx) => {
    for (const a of args) {
      const i = a.indexOf("=");
      if (i > 0) ctx.env[a.slice(0, i)] = a.slice(i + 1);
    }
    return "";
  },
  which: (args, ctx) => {
    void ctx;
    return operands(args).map((n) => (n in coreutils ? `/usr/bin/${n}` : "")).filter(Boolean).join("\n") + "\n";
  },
  basename: (args) => basename(operands(args)[0] ?? "") + "\n",
  dirname: (args) => dirname(operands(args)[0] ?? "") + "\n",
  true: () => "",
  false: () => {
    throw new ShellError("", 1);
  },
};
