// Stub for Node.js built-ins (fs, path, ...) referenced in dead
// ENVIRONMENT_IS_NODE branches of emscripten-generated WASM glue code
// (see next.config.ts turbopack.resolveAlias) that ship isomorphic
// node+browser bundles. Those branches never execute in the browser, but
// bundlers still try to resolve the import statically.
module.exports = {}
