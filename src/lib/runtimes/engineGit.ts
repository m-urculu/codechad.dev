// Git engine — a real repository, in the tab.
//
// isomorphic-git writes an actual .git directory in git's own on-disk format
// onto an in-memory filesystem. Commits have real SHAs, branches are real refs,
// a merge really walks both histories. Nothing here is simulated.
//
// What the learner types is git COMMANDS, not JavaScript. Handing them
// `git.commit({ fs, dir, message })` would teach this library's API, which is
// not a thing anyone needs to know; `git commit -m "..."` is the thing they came
// for. So this module carries a small shell: enough of echo/cat/ls to make files
// worth committing, and the git subcommands a first course covers.
//
// Deliberately absent: clone, fetch, push and pull. They need a network and a
// CORS proxy, and a proxy that reaches arbitrary hosts is not something this app
// should own. The commands report that plainly rather than failing oddly.
//
// ~250 KB over the wire — the lightest engine here by two orders of magnitude.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { extImport, loadScriptOnce, type OnLine } from "./exec";

// The UMD builds, deliberately. The ESM ones carry bare imports the browser
// cannot resolve ("Failed to resolve module specifier \"async-lock\""); these
// bundle their dependencies and expose one global each, which is also how the
// Lua and SQLite engines here load.
const GIT_URL = "https://cdn.jsdelivr.net/npm/isomorphic-git@1.40.0/index.umd.min.js";
const FS_URL = "https://cdn.jsdelivr.net/npm/@isomorphic-git/lightning-fs@4.7.0/dist/lightning-fs.min.js";
// Both libraries reach for Node's Buffer — it is how lightning-fs hands file
// contents to isomorphic-git. Without it every write dies with "Buffer is not
// defined", which surfaces as nonsense like "pathspec did not match any files".
const BUFFER_URL = "https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm";

type Git = any;
type FsModule = any;

let libsP: Promise<{ git: Git; FS: FsModule }> | null = null;

async function getLibs(onLine: OnLine, loadNote?: string): Promise<{ git: Git; FS: FsModule }> {
  if (!libsP) {
    onLine({ kind: "system", text: loadNote || "Loading git…" });
    libsP = (async () => {
      const w = window as unknown as { Buffer?: unknown };
      if (!w.Buffer) {
        const buf = await extImport(BUFFER_URL);
        w.Buffer = (buf.Buffer ?? buf.default?.Buffer) as unknown;
      }
      await Promise.all([loadScriptOnce(GIT_URL), loadScriptOnce(FS_URL)]);
      const g = window as unknown as { git?: Git; LightningFS?: FsModule };
      const git = g.git;
      const FS = g.LightningFS;
      if (!git?.init || !FS) throw new Error("git library did not load");
      return { git, FS };
    })();
    libsP.catch(() => (libsP = null));
  }
  return libsP;
}

const DIR = "/repo";

/** Split a command line into words, respecting quotes — `-m "two words"`. */
function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (/\s/.test(c)) {
      if (cur) out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** `-m "msg"` / `--message="msg"` -> the value, wherever it sits. */
function flagValue(args: string[], short: string, long: string): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === short || args[i] === long) return args[i + 1] ?? null;
    if (args[i].startsWith(long + "=")) return args[i].slice(long.length + 1);
  }
  return null;
}

export async function runGit(script: string, onLine: OnLine, loadNote?: string): Promise<void> {
  let git: Git, FS: FsModule;
  try {
    ({ git, FS } = await getLibs(onLine, loadNote));
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load git: " + String(e) });
    return;
  }

  // A fresh filesystem per Run. Lessons must be reproducible: pressing Run twice
  // has to do the same thing, which it would not if last run's commits survived.
  const fs = new FS("codechad-git", { wipe: true });
  const pfs = fs.promises;
  const out = (text: string) => onLine({ kind: "log", text });
  const err = (text: string) => onLine({ kind: "error", text });

  // Identity for commits. `git config user.name` overwrites these, and the
  // lesson can simply not bother — a course about branching should not fail
  // because nobody set an email.
  let author = { name: "Learner", email: "learner@codechad.dev" };

  const path = (p: string) => (p.startsWith("/") ? p : `${DIR}/${p}`.replace(/\/+/g, "/"));
  const rel = (p: string) => path(p).slice(DIR.length + 1);

  async function exists(p: string): Promise<boolean> {
    try {
      await pfs.stat(p);
      return true;
    } catch {
      return false;
    }
  }

  async function ensureRepo(): Promise<boolean> {
    if (await exists(`${DIR}/.git`)) return true;
    err("fatal: not a git repository (or any of the parent directories): .git");
    return false;
  }

  // Every file under the working tree, .git excluded — for `git add .` and `ls`.
  async function walk(dir: string): Promise<string[]> {
    const names: string[] = await pfs.readdir(dir).catch(() => []);
    const found: string[] = [];
    for (const name of names) {
      if (name === ".git") continue;
      const full = `${dir}/${name}`;
      const st = await pfs.stat(full).catch(() => null);
      if (!st) continue;
      if (st.isDirectory()) found.push(...(await walk(full)));
      else found.push(full.slice(DIR.length + 1));
    }
    return found;
  }

  await pfs.mkdir(DIR).catch(() => {});

  // ---- git subcommands ---------------------------------------------------

  async function gitStatus(): Promise<void> {
    const branch = (await git.currentBranch({ fs, dir: DIR, fullname: false })) || "(no branch)";
    out(`On branch ${branch}`);
    const matrix = await git.statusMatrix({ fs, dir: DIR });
    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];
    // [filepath, HEAD, workdir, stage] — 0 absent, 1 present/unchanged, 2 changed, 3 staged-changed
    for (const [file, head, work, stage] of matrix) {
      if (head === 0 && stage === 0) untracked.push(file);
      else if (stage !== head && stage !== 0) staged.push(file);
      else if (work !== stage) modified.push(file);
    }
    if (staged.length) {
      out("Changes to be committed:");
      for (const f of staged) out(`\tnew file:   ${f}`);
    }
    if (modified.length) {
      out("Changes not staged for commit:");
      for (const f of modified) out(`\tmodified:   ${f}`);
    }
    if (untracked.length) {
      out("Untracked files:");
      for (const f of untracked) out(`\t${f}`);
    }
    if (!staged.length && !modified.length && !untracked.length) out("nothing to commit, working tree clean");
  }

  async function gitLog(args: string[]): Promise<void> {
    const oneline = args.includes("--oneline");
    const nFlag = flagValue(args, "-n", "--max-count");
    const depth = nFlag ? Number(nFlag) : undefined;
    let commits: any[];
    try {
      commits = await git.log({ fs, dir: DIR, depth });
    } catch {
      err("fatal: your current branch does not have any commits yet");
      return;
    }
    for (const c of commits) {
      const msg = String(c.commit.message).trim();
      if (oneline) {
        out(`${c.oid.slice(0, 7)} ${msg.split("\n")[0]}`);
      } else {
        out(`commit ${c.oid}`);
        out(`Author: ${c.commit.author.name} <${c.commit.author.email}>`);
        out("");
        for (const line of msg.split("\n")) out(`    ${line}`);
        out("");
      }
    }
  }

  async function gitBranch(args: string[]): Promise<void> {
    const names = args.filter((a) => !a.startsWith("-"));
    if (args.includes("-d") || args.includes("--delete")) {
      for (const n of names) {
        await git.deleteBranch({ fs, dir: DIR, ref: n });
        out(`Deleted branch ${n}`);
      }
      return;
    }
    if (names.length === 0) {
      const current = await git.currentBranch({ fs, dir: DIR });
      for (const b of await git.listBranches({ fs, dir: DIR })) out(`${b === current ? "*" : " "} ${b}`);
      return;
    }
    for (const n of names) await git.branch({ fs, dir: DIR, ref: n });
  }

  async function gitCheckout(args: string[], isSwitch: boolean): Promise<void> {
    const create = args.includes("-b") || args.includes("-c");
    const ref = args.filter((a) => !a.startsWith("-"))[0];
    if (!ref) return err(`fatal: missing branch name`);
    if (create) await git.branch({ fs, dir: DIR, ref, checkout: false });
    try {
      await git.checkout({ fs, dir: DIR, ref });
    } catch (e) {
      return err(`error: ${(e as Error).message}`);
    }
    out(create ? `Switched to a new branch '${ref}'` : `Switched to branch '${ref}'`);
    void isSwitch;
  }

  async function gitMerge(args: string[]): Promise<void> {
    const theirs = args.filter((a) => !a.startsWith("-"))[0];
    if (!theirs) return err("fatal: no branch named for merge");
    const ours = (await git.currentBranch({ fs, dir: DIR })) as string;
    try {
      const result = await git.merge({ fs, dir: DIR, ours, theirs, author });
      if (result.alreadyMerged) out("Already up to date.");
      else if (result.fastForward) out(`Updating ${theirs}: fast-forward`);
      else out(`Merge made by the 'ort' strategy.`);
      await git.checkout({ fs, dir: DIR, ref: ours });
    } catch (e) {
      const m = (e as Error).message;
      // A conflict is a lesson, not a malfunction — say what git says.
      err(/conflict/i.test(m) ? `CONFLICT: ${m}` : `error: ${m}`);
    }
  }

  async function gitShow(): Promise<void> {
    const oid = await git.resolveRef({ fs, dir: DIR, ref: "HEAD" });
    const { commit } = await git.readCommit({ fs, dir: DIR, oid });
    out(`commit ${oid}`);
    out(`Author: ${commit.author.name} <${commit.author.email}>`);
    out("");
    for (const line of String(commit.message).trim().split("\n")) out(`    ${line}`);
  }

  // ---- one command -------------------------------------------------------

  async function runLine(line: string): Promise<void> {
    const args = tokenize(line);
    if (args.length === 0) return;
    const cmd = args[0];

    // --- the small shell around git -----------------------------------------
    if (cmd === "echo") {
      const redirect = args.findIndex((a) => a === ">" || a === ">>");
      const text = args.slice(1, redirect === -1 ? undefined : redirect).join(" ");
      if (redirect === -1) return out(text);
      const target = path(args[redirect + 1]);
      const prev = args[redirect] === ">>" ? await pfs.readFile(target, "utf8").catch(() => "") : "";
      await pfs.writeFile(target, prev + text + "\n", "utf8");
      return;
    }
    if (cmd === "cat") {
      for (const f of args.slice(1)) {
        const text = await pfs.readFile(path(f), "utf8").catch(() => null);
        if (text === null) err(`cat: ${f}: No such file or directory`);
        else for (const l of String(text).replace(/\n$/, "").split("\n")) out(l);
      }
      return;
    }
    if (cmd === "ls") {
      const target = args[1] ? path(args[1]) : DIR;
      const names: string[] = await pfs.readdir(target).catch(() => []);
      const visible = names.filter((n) => n !== ".git" || args.includes("-a"));
      if (visible.length) out(visible.sort().join("  "));
      return;
    }
    if (cmd === "mkdir") {
      for (const d of args.slice(1).filter((a) => !a.startsWith("-"))) await pfs.mkdir(path(d)).catch(() => {});
      return;
    }
    if (cmd === "rm") {
      for (const f of args.slice(1).filter((a) => !a.startsWith("-"))) await pfs.unlink(path(f)).catch(() => {});
      return;
    }
    if (cmd === "pwd") return out(DIR);
    if (cmd === "touch") {
      for (const f of args.slice(1)) if (!(await exists(path(f)))) await pfs.writeFile(path(f), "", "utf8");
      return;
    }

    if (cmd !== "git") return err(`${cmd}: command not found`);

    // --- git ----------------------------------------------------------------
    const sub = args[1];
    const rest = args.slice(2);

    switch (sub) {
      case "init": {
        await git.init({ fs, dir: DIR, defaultBranch: "main" });
        return out(`Initialized empty Git repository in ${DIR}/.git/`);
      }
      case "config": {
        const key = rest.find((a) => a.includes("."));
        const value = rest[rest.indexOf(key ?? "") + 1];
        if (key === "user.name" && value) author = { ...author, name: value };
        else if (key === "user.email" && value) author = { ...author, email: value };
        return;
      }
      case "status":
        return (await ensureRepo()) ? gitStatus() : undefined;
      case "add": {
        if (!(await ensureRepo())) return;
        const targets = rest.filter((a) => !a.startsWith("-"));
        const files = targets.includes(".") || targets.includes("-A") ? await walk(DIR) : targets.map(rel);
        for (const f of files) {
          try {
            await git.add({ fs, dir: DIR, filepath: f });
          } catch (e) {
            // Only a missing file is a pathspec problem. Reporting everything
            // that way once hid a "Buffer is not defined" for five test runs.
            const m = (e as Error).message;
            err(/ENOENT|not found/i.test(m) ? `fatal: pathspec '${f}' did not match any files` : `error: ${m}`);
          }
        }
        return;
      }
      case "rm": {
        if (!(await ensureRepo())) return;
        for (const f of rest.filter((a) => !a.startsWith("-"))) {
          await git.remove({ fs, dir: DIR, filepath: rel(f) });
          await pfs.unlink(path(f)).catch(() => {});
          out(`rm '${rel(f)}'`);
        }
        return;
      }
      case "commit": {
        if (!(await ensureRepo())) return;
        const message = flagValue(rest, "-m", "--message");
        if (!message) return err("fatal: no commit message given (use -m)");
        // isomorphic-git will happily write an empty commit; git refuses. Telling
        // someone "committed" when they forgot to `git add` teaches the opposite
        // of what the staging area lesson is for.
        if (!rest.includes("--allow-empty")) {
          const matrix = await git.statusMatrix({ fs, dir: DIR });
          // STAGE differs from HEAD -> something is actually staged.
          const anyStaged = matrix.some(([, head, , stage]: number[]) => (head === 0 ? stage !== 0 : stage !== 1));
          if (!anyStaged) {
            const branch = await git.currentBranch({ fs, dir: DIR });
            out(`On branch ${branch}`);
            return out("nothing to commit, working tree clean");
          }
        }
        try {
          const oid = await git.commit({ fs, dir: DIR, message, author });
          const branch = await git.currentBranch({ fs, dir: DIR });
          return out(`[${branch} ${oid.slice(0, 7)}] ${message.split("\n")[0]}`);
        } catch (e) {
          return err(`error: ${(e as Error).message}`);
        }
      }
      case "log":
        return (await ensureRepo()) ? gitLog(rest) : undefined;
      case "branch":
        return (await ensureRepo()) ? gitBranch(rest) : undefined;
      case "checkout":
        return (await ensureRepo()) ? gitCheckout(rest, false) : undefined;
      case "switch":
        return (await ensureRepo()) ? gitCheckout(rest, true) : undefined;
      case "merge":
        return (await ensureRepo()) ? gitMerge(rest) : undefined;
      case "show":
        return (await ensureRepo()) ? gitShow() : undefined;
      case "tag": {
        if (!(await ensureRepo())) return;
        const name = rest.filter((a) => !a.startsWith("-"))[0];
        if (!name) {
          for (const t of await git.listTags({ fs, dir: DIR })) out(t);
          return;
        }
        await git.tag({ fs, dir: DIR, ref: name });
        return;
      }
      case "clone":
      case "fetch":
      case "push":
      case "pull":
        return err(
          `git ${sub} needs a network connection, which this sandbox does not have. ` +
            `Everything local — commits, branches, merges — works.`
        );
      default:
        return err(`git: '${sub}' is not a command this sandbox implements.`);
    }
  }

  // ---- the script --------------------------------------------------------
  for (const raw of script.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    try {
      await runLine(line);
    } catch (e) {
      err(`error: ${(e as Error).message}`);
    }
  }
}
