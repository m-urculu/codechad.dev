// Lua engine — fengari (Lua 5.4 VM in JS, CDN). A fresh lua_State per Run; print()
// is overridden to write to the console pane.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadScriptOnce, type OnLine } from "./exec";

const SRC = "https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.min.js";

export async function runLua(code: string, onLine: OnLine): Promise<void> {
  try {
    await loadScriptOnce(SRC);
  } catch (e) {
    onLine({ kind: "error", text: "Failed to load the Lua engine: " + String(e) });
    return;
  }
  const fengari = (window as any).fengari;
  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = {
    lua: fengari.lua,
    lauxlib: fengari.lauxlib,
    lualib: fengari.lualib,
    to_luastring: fengari.to_luastring,
    to_jsstring: fengari.to_jsstring,
  };

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  // print(...) -> console pane (tab-separated, like stock Lua)
  lua.lua_pushjsfunction(L, (L2: any) => {
    const n = lua.lua_gettop(L2);
    const parts: string[] = [];
    for (let i = 1; i <= n; i++) {
      parts.push(to_jsstring(lauxlib.luaL_tolstring(L2, i)));
      lua.lua_pop(L2, 1);
    }
    onLine({ kind: "log", text: parts.join("\t") });
    return 0;
  });
  lua.lua_setglobal(L, to_luastring("print"));

  try {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
      onLine({ kind: "error", text: to_jsstring(lua.lua_tostring(L, -1)) });
    }
  } catch (e: any) {
    onLine({ kind: "error", text: e?.message || String(e) });
  } finally {
    lua.lua_close(L);
  }
}
