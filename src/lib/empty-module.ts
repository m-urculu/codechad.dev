// Stands in for Node-only modules in the browser bundle (next.config.ts, turbopack
// resolveAlias). web-tree-sitter imports them behind a runtime "is this Node?" check
// that is never true in a browser, but the bundler still has to resolve them.
export {};
