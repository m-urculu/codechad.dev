// Linux engine — the shell and the commands, on an in-memory filesystem.
//
// The alternative was booting a real x86 Linux in the browser (v86, or CheerpX
// which emulates the syscall layer instead of running a kernel). Both work, and
// both are the wrong trade here: hundreds of megabytes per learner, an emulated
// CPU an order of magnitude off native, and a terminal UI this app does not have
// — to teach `ls`, `grep` and file permissions.
//
// So: a real shell (pipes, redirection, exit codes, $?) over a real filesystem,
// with commands that behave the way GNU coreutils behave where a lesson could
// notice. What it is not is a kernel — no processes, no users, no devices, and
// permissions enforced by the commands rather than beneath them. That is honest
// for teaching what the bits mean and useless as a security boundary, and the
// runtime notes say exactly that so no lesson claims otherwise.
//
// ~250 KB over the wire, shared with the Git module.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadScriptOnce, type OnLine } from "./exec";
import { createShell } from "./shell";
import { coreutils } from "./coreutils";

const FS_URL = "https://cdn.jsdelivr.net/npm/@isomorphic-git/lightning-fs@4.7.0/dist/lightning-fs.min.js";
const BUFFER_URL = "https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm";

let fsModuleP: Promise<any> | null = null;

/** lightning-fs, shared with the Git engine. Buffer comes first: it needs one. */
export async function getFsModule(): Promise<any> {
  if (!fsModuleP) {
    fsModuleP = (async () => {
      const w = window as unknown as { Buffer?: unknown; LightningFS?: any };
      if (!w.Buffer) {
        const buf = await import(/* webpackIgnore: true */ BUFFER_URL);
        w.Buffer = (buf.Buffer ?? buf.default?.Buffer) as unknown;
      }
      await loadScriptOnce(FS_URL);
      if (!w.LightningFS) throw new Error("filesystem library did not load");
      return w.LightningFS;
    })();
    fsModuleP.catch(() => (fsModuleP = null));
  }
  return fsModuleP;
}

const HOME = "/home/learner";

export async function runLinux(script: string, onLine: OnLine, loadNote?: string): Promise<void> {
  let FS: any;
  try {
    if (!fsModuleP) onLine({ kind: "system", text: loadNote || "Starting the shell…" });
    FS = await getFsModule();
  } catch (e) {
    onLine({ kind: "error", text: "Failed to start the shell: " + String(e) });
    return;
  }

  // Wiped every Run: a lesson whose second Run behaves differently is not a lesson.
  const fs = new FS("codechad-linux", { wipe: true });
  for (const dir of ["/home", HOME, "/tmp", "/usr", "/usr/bin", "/etc"]) {
    await fs.promises.mkdir(dir).catch(() => {});
  }

  const shell = createShell({ fs, commands: coreutils, cwd: HOME });
  await shell.run(script, (kind, text) => onLine({ kind, text }));
}
