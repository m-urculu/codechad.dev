// Git engine — a real repository, in the tab.
//
// isomorphic-git writes an actual .git directory in git's own on-disk format
// onto an in-memory filesystem. Commits have real SHAs, branches are real refs,
// a merge really walks both histories. Nothing here is simulated.
//
// What the learner types is git COMMANDS, not JavaScript. Handing them
// `git.commit({ fs, dir, message })` would teach this library's API, which is
// not a thing anyone needs to know; `git commit -m "..."` is what they came for.
// So `git` is registered as one command in the shared shell (shell.ts) next to
// the real coreutils — which is how it works on a machine, and means
// `git log --oneline | wc -l` composes without anything extra.
//
// Deliberately absent: clone, fetch, push and pull. They need a network and a
// CORS proxy, and a proxy that reaches arbitrary hosts is not something this app
// should own. The commands say so rather than failing obscurely.
//
// ~250 KB over the wire, most of it isomorphic-git.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadScriptOnce, type OnLine } from "./exec";
import { createShell, ShellError, type CommandFn } from "./shell";
import { coreutils } from "./coreutils";
import { getFsModule } from "./engineLinux";

// The UMD build, deliberately: the ESM one carries bare imports a browser cannot
// resolve ("Failed to resolve module specifier 'async-lock'").
const GIT_URL = "https://cdn.jsdelivr.net/npm/isomorphic-git@1.40.0/index.umd.min.js";

type Git = any;

let gitP: Promise<Git> | null = null;

async function getGit(): Promise<Git> {
  if (!gitP) {
    gitP = (async () => {
      await getFsModule(); // also installs the Buffer polyfill both libraries need
      await loadScriptOnce(GIT_URL);
      const w = window as unknown as { git?: Git };
      if (!w.git?.init) throw new Error("git library did not load");
      return w.git;
    })();
    gitP.catch(() => (gitP = null));
  }
  return gitP;
}

const HOME = "/home/learner";

/** `-m "msg"` / `--message="msg"` — the value, wherever it sits. */
function flagValue(args: string[], short: string, long: string): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === short || args[i] === long) return args[i + 1] ?? null;
    if (args[i].startsWith(long + "=")) return args[i].slice(long.length + 1);
  }
  return null;
}

/**
 * The `git` command.
 *
 * The repository root is found by walking up from the working directory looking
 * for .git, exactly as git does — so `cd project && git status` behaves, and a
 * command run outside a repository gets git's own fatal message.
 */
function gitCommand(git: Git): CommandFn {
  // Reset per Run by runGit, so `git config` in one lesson cannot leak into the next.
  const author = { name: "Learner", email: "learner@codechad.dev" };

  return async (args, ctx) => {
    const sub = args[0];
    const rest = args.slice(1);
    const fs = ctx.fs;

    async function repo(): Promise<string> {
      let dir = ctx.cwd;
      for (;;) {
        if (await ctx.stat(`${dir}/.git`)) return dir;
        if (dir === "/") {
          throw new ShellError("fatal: not a git repository (or any of the parent directories): .git", 128);
        }
        dir = dir.slice(0, dir.lastIndexOf("/")) || "/";
      }
    }

    /** Paths reach git relative to the repository root, not the shell's cwd. */
    const relTo = (dir: string, p: string) => {
      const abs = ctx.resolve(p);
      return abs.startsWith(dir + "/") ? abs.slice(dir.length + 1) : abs.replace(/^\//, "");
    };

    async function walkFiles(dir: string, at = dir): Promise<string[]> {
      const names: string[] = await ctx.pfs.readdir(at).catch(() => []);
      const found: string[] = [];
      for (const name of names) {
        if (name === ".git") continue;
        const full = `${at}/${name}`;
        const st = await ctx.stat(full);
        if (!st) continue;
        if (st.isDirectory()) found.push(...(await walkFiles(dir, full)));
        else found.push(full.slice(dir.length + 1));
      }
      return found;
    }

    switch (sub) {
      case undefined:
        throw new ShellError("usage: git <command> [<args>]");

      case "init": {
        const dir = ctx.cwd;
        await git.init({ fs, dir, defaultBranch: "main" });
        return `Initialized empty Git repository in ${dir}/.git/\n`;
      }

      case "config": {
        const key = rest.find((a) => a.includes("."));
        const value = rest[rest.indexOf(key ?? "") + 1];
        if (key === "user.name" && value) author.name = value;
        else if (key === "user.email" && value) author.email = value;
        return "";
      }

      case "status": {
        const dir = await repo();
        const branch = (await git.currentBranch({ fs, dir, fullname: false })) || "(no branch)";
        const matrix = await git.statusMatrix({ fs, dir });
        const staged: string[] = [];
        const modified: string[] = [];
        const untracked: string[] = [];
        // [filepath, HEAD, WORKDIR, STAGE]
        for (const [file, head, work, stage] of matrix) {
          if (head === 0 && stage === 0) untracked.push(file);
          else if (head === 0 ? stage !== 0 : stage !== 1) staged.push(file);
          else if (work !== stage) modified.push(file);
        }
        const out = [`On branch ${branch}`];
        if (staged.length) {
          out.push("Changes to be committed:");
          for (const f of staged) out.push(`\tnew file:   ${f}`);
        }
        if (modified.length) {
          out.push("Changes not staged for commit:");
          for (const f of modified) out.push(`\tmodified:   ${f}`);
        }
        if (untracked.length) {
          out.push("Untracked files:");
          for (const f of untracked) out.push(`\t${f}`);
        }
        if (!staged.length && !modified.length && !untracked.length) {
          out.push("nothing to commit, working tree clean");
        }
        return out.join("\n") + "\n";
      }

      case "add": {
        const dir = await repo();
        const targets = rest.filter((a) => !a.startsWith("-"));
        const files =
          targets.includes(".") || rest.includes("-A") ? await walkFiles(dir) : targets.map((t) => relTo(dir, t));
        for (const f of files) {
          try {
            await git.add({ fs, dir, filepath: f });
          } catch (e) {
            // Only a missing file is a pathspec problem. Reporting everything that
            // way once hid a "Buffer is not defined" across five test runs.
            const m = (e as Error).message;
            throw new ShellError(
              /ENOENT|not found/i.test(m) ? `fatal: pathspec '${f}' did not match any files` : `error: ${m}`
            );
          }
        }
        return "";
      }

      case "rm": {
        const dir = await repo();
        const out: string[] = [];
        for (const f of rest.filter((a) => !a.startsWith("-"))) {
          const rel = relTo(dir, f);
          await git.remove({ fs, dir, filepath: rel });
          await ctx.pfs.unlink(ctx.resolve(f)).catch(() => {});
          out.push(`rm '${rel}'`);
        }
        return out.join("\n") + "\n";
      }

      case "commit": {
        const dir = await repo();
        const message = flagValue(rest, "-m", "--message");
        if (!message) throw new ShellError("fatal: no commit message given (use -m)");
        // isomorphic-git will happily write an empty commit; git refuses. Telling
        // someone "committed" when they forgot to `git add` teaches the opposite
        // of what the staging-area lesson is for.
        if (!rest.includes("--allow-empty")) {
          const matrix = await git.statusMatrix({ fs, dir });
          const anyStaged = matrix.some(([, head, , stage]: number[]) => (head === 0 ? stage !== 0 : stage !== 1));
          if (!anyStaged) {
            const branch = await git.currentBranch({ fs, dir });
            return `On branch ${branch}\nnothing to commit, working tree clean\n`;
          }
        }
        const oid = await git.commit({ fs, dir, message, author });
        const branch = await git.currentBranch({ fs, dir });
        return `[${branch} ${oid.slice(0, 7)}] ${message.split("\n")[0]}\n`;
      }

      case "log": {
        const dir = await repo();
        const nFlag = flagValue(rest, "-n", "--max-count");
        let commits: any[];
        try {
          commits = await git.log({ fs, dir, depth: nFlag ? Number(nFlag) : undefined });
        } catch {
          throw new ShellError("fatal: your current branch does not have any commits yet", 128);
        }
        const out: string[] = [];
        for (const c of commits) {
          const msg = String(c.commit.message).trim();
          if (rest.includes("--oneline")) {
            out.push(`${c.oid.slice(0, 7)} ${msg.split("\n")[0]}`);
          } else {
            out.push(`commit ${c.oid}`);
            out.push(`Author: ${c.commit.author.name} <${c.commit.author.email}>`);
            out.push("");
            for (const line of msg.split("\n")) out.push(`    ${line}`);
            out.push("");
          }
        }
        return out.join("\n") + "\n";
      }

      case "branch": {
        const dir = await repo();
        const names = rest.filter((a) => !a.startsWith("-"));
        if (rest.includes("-d") || rest.includes("--delete")) {
          const out: string[] = [];
          for (const n of names) {
            await git.deleteBranch({ fs, dir, ref: n });
            out.push(`Deleted branch ${n}`);
          }
          return out.join("\n") + "\n";
        }
        if (names.length === 0) {
          const current = await git.currentBranch({ fs, dir });
          const list: string[] = await git.listBranches({ fs, dir });
          return list.map((b) => `${b === current ? "*" : " "} ${b}`).join("\n") + "\n";
        }
        for (const n of names) await git.branch({ fs, dir, ref: n });
        return "";
      }

      case "checkout":
      case "switch": {
        const dir = await repo();
        const create = rest.includes("-b") || rest.includes("-c");
        const ref = rest.filter((a) => !a.startsWith("-"))[0];
        if (!ref) throw new ShellError("fatal: missing branch name");
        if (create) await git.branch({ fs, dir, ref, checkout: false });
        try {
          await git.checkout({ fs, dir, ref });
        } catch (e) {
          throw new ShellError(`error: ${(e as Error).message}`);
        }
        return create ? `Switched to a new branch '${ref}'\n` : `Switched to branch '${ref}'\n`;
      }

      case "merge": {
        const dir = await repo();
        const theirs = rest.filter((a) => !a.startsWith("-"))[0];
        if (!theirs) throw new ShellError("fatal: no branch named for merge");
        const ours = (await git.currentBranch({ fs, dir })) as string;
        try {
          const result = await git.merge({ fs, dir, ours, theirs, author });
          await git.checkout({ fs, dir, ref: ours });
          if (result.alreadyMerged) return "Already up to date.\n";
          if (result.fastForward) return `Updating ${theirs}: fast-forward\n`;
          return "Merge made by the 'ort' strategy.\n";
        } catch (e) {
          const m = (e as Error).message;
          // A conflict is a lesson, not a malfunction — say what git says.
          throw new ShellError(/conflict/i.test(m) ? `CONFLICT: ${m}` : `error: ${m}`);
        }
      }

      case "show": {
        const dir = await repo();
        const oid = await git.resolveRef({ fs, dir, ref: "HEAD" });
        const { commit } = await git.readCommit({ fs, dir, oid });
        const out = [`commit ${oid}`, `Author: ${commit.author.name} <${commit.author.email}>`, ""];
        for (const line of String(commit.message).trim().split("\n")) out.push(`    ${line}`);
        return out.join("\n") + "\n";
      }

      case "tag": {
        const dir = await repo();
        const name = rest.filter((a) => !a.startsWith("-"))[0];
        if (!name) return ((await git.listTags({ fs, dir })) as string[]).join("\n") + "\n";
        await git.tag({ fs, dir, ref: name });
        return "";
      }

      case "clone":
      case "fetch":
      case "push":
      case "pull":
        throw new ShellError(
          `git ${sub} needs a network connection, which this sandbox does not have. ` +
            `Everything local — commits, branches, merges — works.`
        );

      default:
        throw new ShellError(`git: '${sub}' is not a command this sandbox implements.`);
    }
  };
}

export async function runGit(script: string, onLine: OnLine, loadNote?: string): Promise<void> {
  let git: Git, FS: any;
  try {
    if (!gitP) onLine({ kind: "system", text: loadNote || "Loading git…" });
    [git, FS] = await Promise.all([getGit(), getFsModule()]);
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load git: " + String(e) });
    return;
  }

  // A fresh filesystem per Run. Lessons must be reproducible: pressing Run twice
  // has to do the same thing, which it would not if the last run's commits survived.
  const fs = new FS("codechad-git", { wipe: true });
  for (const dir of ["/home", HOME]) await fs.promises.mkdir(dir).catch(() => {});

  const shell = createShell({ fs, commands: { ...coreutils, git: gitCommand(git) }, cwd: HOME });
  await shell.run(script, (kind, text) => onLine({ kind, text }));
}
