// C engine — real Clang and LLD, compiled to WebAssembly, running in the tab.
//
// Not an interpreter and not a subset: the learner's code goes through the same
// compiler front end they would use on a laptop, so `sizeof` is honest, pointer
// arithmetic is honest, and undefined behaviour is undefined rather than politely
// corrected. That matters more here than in any other module — the course this
// serves is about memory, and a simulator that fakes memory teaches the wrong thing.
//
// It is NOT a machine with memory protection, and the lessons must not pretend it
// is: wasm memory is one flat region starting at address 0, so a null dereference
// or a use-after-free reads whatever is there and carries on. See the trap notes
// on the catch below — every case there was measured, not assumed.
//
// The compiler is ~23 MB over the wire on first use, in the same range as the
// Ruby and DuckDB engines, and is cached by the browser afterwards. It needs no
// SharedArrayBuffer, so the page does not have to be cross-origin isolated and
// the other runtimes' CDN loads keep working.
//
// The compiled program then runs under our own small WASI host (see wasi.ts).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { extImport, type OnLine } from "./exec";
import { createWasi } from "./wasi";

// Pinned: a toolchain that changes under us would change what compiles.
const VERSION = "22.0.0-git20542-10";
const BUNDLE = `https://cdn.jsdelivr.net/npm/@yowasp/clang@${VERSION}/gen/bundle.js`;

type Tree = Record<string, unknown>;
type RunOptions = {
  stdout?: (b: Uint8Array | null) => void;
  stderr?: (b: Uint8Array | null) => void;
};
type Command = (args: string[], files: Tree, options?: RunOptions) => Promise<Tree>;

// The compiler itself. Fetched by us rather than left to the toolchain's loader:
// its own progress callback never fires, and a first run is a ~90 second wait on
// a normal connection. Ninety silent seconds reads as a broken page.
const CORE_WASM = `https://cdn.jsdelivr.net/npm/@yowasp/clang@${VERSION}/gen/llvm.core.wasm`;

let toolchainP: Promise<Command> | null = null;

/**
 * Streams the compiler into the HTTP cache, reporting progress as it goes.
 *
 * The bytes are dropped on the floor: the point is that the toolchain's own
 * fetch, moments later, is served from cache (jsDelivr marks it immutable). If
 * anything here fails we simply say nothing and let the toolchain fetch it the
 * slow, quiet way — this is a progress bar, never a dependency.
 */
async function prefetchCompiler(onLine: OnLine): Promise<void> {
  try {
    const res = await fetch(CORE_WASM);
    if (!res.ok || !res.body) return;
    const total = Number(res.headers.get("content-length")) || 0;
    const reader = res.body.getReader();
    let done = 0;
    let lastPct = -1;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      done += chunk.value.byteLength;
      if (!total) continue;
      const pct = Math.floor((done / total) * 10) * 10;
      if (pct > lastPct && pct < 100) {
        lastPct = pct;
        onLine({ kind: "system", text: `Downloading the C compiler… ${pct}%` });
      }
    }
  } catch {
    /* fall through to the toolchain's own loader */
  }
}

async function getClang(onLine: OnLine, loadNote?: string): Promise<Command> {
  if (!toolchainP) {
    onLine({ kind: "system", text: loadNote || "Loading the C compiler…" });
    toolchainP = (async () => {
      await prefetchCompiler(onLine);
      const mod = await extImport(BUNDLE);
      const clang = (mod.runClang ?? mod.default?.runClang) as Command | undefined;
      if (!clang) throw new Error("clang entry point missing from the toolchain bundle");
      onLine({ kind: "system", text: "Compiler ready — compiling…" });
      return clang;
    })();
    toolchainP.catch(() => (toolchainP = null)); // a failed load must be retryable
  }
  return toolchainP;
}

/** Emit whole lines as they arrive; hold a partial line until it finishes. */
function lineWriter(kind: "log" | "error", onLine: OnLine) {
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (final: boolean) => {
    const parts = buffer.split("\n");
    buffer = final ? "" : parts.pop() ?? "";
    for (const p of parts) onLine({ kind, text: p });
    if (final && buffer) onLine({ kind, text: buffer });
  };
  return {
    // The toolchain writes in small pieces and sends `null` between them as a
    // flush hint. Treating that hint as a line break is what once printed a
    // compiler error one fragment per line ("main.c", ":", "3", ":", "23").
    // Only a real newline ends a line; anything left over is emitted by end().
    write(b: Uint8Array | null) {
      if (b === null) return;
      buffer += decoder.decode(b, { stream: true });
      if (buffer.includes("\n")) flush(false);
    },
    end() {
      if (buffer) {
        onLine({ kind, text: buffer });
        buffer = "";
      }
    },
  };
}

export async function runC(code: string, onLine: OnLine, loadNote?: string): Promise<void> {
  let clang: Command;
  try {
    clang = await getClang(onLine, loadNote);
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load the C compiler: " + String(e) });
    return;
  }

  // --- compile ------------------------------------------------------------
  // Diagnostics are the lesson half the time, so they go to the console exactly
  // as clang wrote them, warnings included.
  const diagnostics = lineWriter("error", onLine);
  let program: Uint8Array | undefined;
  try {
    const out = await clang(
      ["clang", "main.c", "-o", "prog", "-Wall", "-std=c17"],
      { "main.c": code },
      {
        stderr: (b) => diagnostics.write(b),
        stdout: (b) => diagnostics.write(b),
      }
    );
    diagnostics.end();
    program = out["prog"] as Uint8Array | undefined;
  } catch (e) {
    // The toolchain throws on a nonzero exit; clang has already said why.
    diagnostics.end();
    const code_ = (e as { code?: number }).code;
    onLine({
      kind: "error",
      text: code_ === undefined ? "Compilation failed: " + String(e) : "Compilation failed.",
    });
    return;
  }

  if (!program) {
    onLine({ kind: "error", text: "Compilation produced no program." });
    return;
  }

  // --- run ----------------------------------------------------------------
  const stdout = lineWriter("log", onLine);
  const stderr = lineWriter("error", onLine);
  const wasi = createWasi((stream, text) =>
    (stream === "out" ? stdout : stderr).write(new TextEncoder().encode(text))
  );

  try {
    const module = await WebAssembly.compile(program as unknown as BufferSource);
    const instance = await WebAssembly.instantiate(module, wasi.imports);
    const { exitCode } = wasi.start(instance);
    stdout.end();
    stderr.end();
    if (exitCode !== 0) onLine({ kind: "system", text: `Program exited with code ${exitCode}.` });
  } catch (e) {
    stdout.end();
    stderr.end();
    if (e instanceof WebAssembly.RuntimeError) {
      // Which bugs land here was measured, not assumed: a far-out pointer, a
      // stack overflow from runaway recursion, a failed assert and an integer
      // divide by zero trap. A null dereference, a small array overrun and a
      // use-after-free do NOT — they read whatever is there, exactly as an
      // unlucky program on a real machine does.
      const hint = /divide by zero/i.test(e.message)
        ? "an integer divided by zero"
        : /unreachable/i.test(e.message)
          ? "the program aborted — a failed assert(), or a call to abort()"
          : "memory outside the program was touched — a wild pointer, or runaway recursion overflowing the stack";
      onLine({ kind: "error", text: `Crash: ${e.message} — ${hint}.` });
    } else {
      onLine({ kind: "error", text: String(e) });
    }
  }
}
