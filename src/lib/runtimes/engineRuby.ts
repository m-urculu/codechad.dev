// Ruby engine — ruby.wasm (CRuby + stdlib, CDN). The wasm module is compiled once and
// cached; each Run gets a FRESH VM instance (clean state). stdout/stderr are captured
// inside Ruby itself (StringIO) — robust across wasm builds, no console monkeypatching.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { extImport, type OnLine } from "./exec";

const VM_URL = "https://cdn.jsdelivr.net/npm/@ruby/wasm-wasi@2.7.1/dist/browser/+esm";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@ruby/3.4-wasm-wasi@2.7.1/dist/ruby+stdlib.wasm";

let compiledP: Promise<{ mod: WebAssembly.Module; DefaultRubyVM: any }> | null = null;

export async function runRuby(code: string, onLine: OnLine, loadNote?: string): Promise<void> {
  if (!compiledP) {
    onLine({ kind: "system", text: loadNote || "Loading Ruby…" });
    compiledP = (async () => {
      const m = await extImport(VM_URL);
      const resp = await fetch(WASM_URL);
      const mod = await WebAssembly.compileStreaming(resp);
      return { mod, DefaultRubyVM: m.DefaultRubyVM };
    })();
    compiledP.catch(() => (compiledP = null));
  }
  let mod: WebAssembly.Module, DefaultRubyVM: any;
  try {
    ({ mod, DefaultRubyVM } = await compiledP);
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load the Ruby runtime: " + String(e) });
    return;
  }
  try {
    // Fresh VM per run -> clean globals. Capture stdout/stderr with StringIO.
    const { vm } = await DefaultRubyVM(mod, { consolePrint: false });
    vm.eval(`require "stringio"; $stdout = StringIO.new; $stderr = StringIO.new`);
    let result: any = null;
    let runErr: any = null;
    try {
      result = vm.eval(code);
    } catch (e) {
      runErr = e;
    }
    const out = vm.eval("$stdout.string").toString();
    const errOut = vm.eval("$stderr.string").toString();
    for (const line of out.split("\n")) if (line !== "") onLine({ kind: "log", text: line });
    for (const line of errOut.split("\n")) if (line !== "") onLine({ kind: "warn", text: line });
    if (runErr) {
      onLine({ kind: "error", text: (runErr as any)?.message || String(runErr) });
    } else {
      const s = result?.toString?.();
      if (s && s !== "nil" && s !== "") onLine({ kind: "info", text: "=> " + s });
    }
  } catch (e: any) {
    onLine({ kind: "error", text: e?.message || String(e) });
  }
}
