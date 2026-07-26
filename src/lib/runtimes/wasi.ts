// A small WASI preview1 host, enough to run a self-contained compiled program.
//
// Programs built against wasi-libc call into the host for everything the C
// standard library cannot do alone: writing to stdout, exiting, asking the clock.
// This provides exactly that surface and nothing more — file opens are refused,
// which is not a limitation to apologise for but the same self-containment rule
// every other runtime here follows (no network, no files, no shell).
//
// Written by hand rather than pulled in: the whole useful surface is ~10 calls,
// and owning it means stdout arrives as console lines with no adapter in between.

/** Thrown by proc_exit to unwind out of the program. Not an error. */
class Exited {
  constructor(public code: number) {}
}

const ESUCCESS = 0;
const EBADF = 8;
const ENOSYS = 52;
const ENOTCAPABLE = 76;

export type WasiResult = { exitCode: number };

/**
 * Builds the `wasi_snapshot_preview1` import object.
 *
 * `onText` receives decoded output as the program writes it, tagged by stream so
 * the console can colour stderr differently. Text is emitted per write, not per
 * line: libc buffers and flushes in its own rhythm, and inventing line breaks
 * here would misreport what the program printed.
 */
export function createWasi(onText: (stream: "out" | "err", text: string) => void) {
  let memory: WebAssembly.Memory | null = null;
  const decoder = new TextDecoder();

  const view = () => new DataView(memory!.buffer);
  const bytes = () => new Uint8Array(memory!.buffer);

  // Gather an iovec array into one string. This is how every write arrives.
  function readIovs(iovsPtr: number, iovsLen: number): { text: string; written: number } {
    const dv = view();
    const mem = bytes();
    let text = "";
    let written = 0;
    for (let i = 0; i < iovsLen; i++) {
      const base = dv.getUint32(iovsPtr + i * 8, true);
      const len = dv.getUint32(iovsPtr + i * 8 + 4, true);
      text += decoder.decode(mem.subarray(base, base + len));
      written += len;
    }
    return { text, written };
  }

  const wasiImport: Record<string, (...args: never[]) => number> = {
    // --- the ones that matter ---------------------------------------------
    fd_write: ((fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) => {
      if (fd !== 1 && fd !== 2) return EBADF;
      const { text, written } = readIovs(iovsPtr, iovsLen);
      if (text) onText(fd === 1 ? "out" : "err", text);
      view().setUint32(nwrittenPtr, written, true);
      return ESUCCESS;
    }) as never,

    proc_exit: ((code: number) => {
      throw new Exited(code);
    }) as never,

    // stdin is always at end-of-file: there is no one to type at it.
    fd_read: ((fd: number, _iovs: number, _len: number, nreadPtr: number) => {
      if (fd !== 0) return EBADF;
      view().setUint32(nreadPtr, 0, true);
      return ESUCCESS;
    }) as never,

    // --- enough of the rest that libc starts up cleanly ---------------------
    // A program's argv is just its name; it has no environment.
    args_sizes_get: ((countPtr: number, sizePtr: number) => {
      const dv = view();
      dv.setUint32(countPtr, 1, true);
      dv.setUint32(sizePtr, "main".length + 1, true);
      return ESUCCESS;
    }) as never,
    args_get: ((argvPtr: number, bufPtr: number) => {
      view().setUint32(argvPtr, bufPtr, true);
      bytes().set(new TextEncoder().encode("main\0"), bufPtr);
      return ESUCCESS;
    }) as never,
    environ_sizes_get: ((countPtr: number, sizePtr: number) => {
      const dv = view();
      dv.setUint32(countPtr, 0, true);
      dv.setUint32(sizePtr, 0, true);
      return ESUCCESS;
    }) as never,
    environ_get: (() => ESUCCESS) as never,

    clock_time_get: ((_id: number, _precision: bigint, outPtr: number) => {
      // Nanoseconds since the epoch, which is what CLOCK_REALTIME means.
      view().setBigUint64(outPtr, BigInt(Date.now()) * BigInt(1_000_000), true);
      return ESUCCESS;
    }) as never,
    clock_res_get: ((_id: number, outPtr: number) => {
      view().setBigUint64(outPtr, BigInt(1_000_000), true);
      return ESUCCESS;
    }) as never,
    random_get: ((ptr: number, len: number) => {
      crypto.getRandomValues(bytes().subarray(ptr, ptr + len));
      return ESUCCESS;
    }) as never,

    // libc scans pre-opened directories at startup; EBADF ends the scan, which
    // is the correct answer when no directory is granted.
    fd_prestat_get: (() => EBADF) as never,
    fd_prestat_dir_name: (() => EBADF) as never,

    fd_close: (() => ESUCCESS) as never,
    fd_fdstat_get: ((fd: number, statPtr: number) => {
      const dv = view();
      dv.setUint8(statPtr, 2); // filetype: character device — a terminal
      dv.setUint16(statPtr + 2, 0, true);
      dv.setBigUint64(statPtr + 8, BigInt(0), true);
      dv.setBigUint64(statPtr + 16, BigInt(0), true);
      void fd;
      return ESUCCESS;
    }) as never,
    fd_fdstat_set_flags: (() => ESUCCESS) as never,
    fd_seek: ((_fd: number, _off: bigint, _whence: number, outPtr: number) => {
      view().setBigUint64(outPtr, BigInt(0), true); // a terminal has no position
      return ESUCCESS;
    }) as never,
    fd_sync: (() => ESUCCESS) as never,
    fd_datasync: (() => ESUCCESS) as never,
    fd_filestat_get: (() => ENOSYS) as never,
    sched_yield: (() => ESUCCESS) as never,
    poll_oneoff: (() => ENOSYS) as never,

    // Deliberately refused — see the note at the top of this file.
    path_open: (() => ENOTCAPABLE) as never,
    path_filestat_get: (() => ENOTCAPABLE) as never,
    path_unlink_file: (() => ENOTCAPABLE) as never,
    path_create_directory: (() => ENOTCAPABLE) as never,
    path_remove_directory: (() => ENOTCAPABLE) as never,
    path_readlink: (() => ENOTCAPABLE) as never,
    path_rename: (() => ENOTCAPABLE) as never,
    fd_readdir: (() => ENOTCAPABLE) as never,
  };

  return {
    imports: { wasi_snapshot_preview1: wasiImport },

    /**
     * Runs an instantiated module to completion.
     *
     * A clean exit and an explicit `proc_exit` both land here as a number. A trap
     * — dereferencing a null pointer, running off the end of an array, an
     * assert — is a WebAssembly.RuntimeError and is the caller's to report: for
     * a memory-management lesson it is the whole point, not an accident.
     */
    start(instance: WebAssembly.Instance): WasiResult {
      memory = instance.exports.memory as WebAssembly.Memory;
      const entry = instance.exports._start as (() => void) | undefined;
      if (!entry) throw new Error("compiled program has no entry point");
      try {
        entry();
        return { exitCode: 0 };
      } catch (e) {
        if (e instanceof Exited) return { exitCode: e.code };
        throw e;
      }
    },
  };
}
