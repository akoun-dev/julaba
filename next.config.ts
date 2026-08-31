import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["146.59.230.23"],
  /* config options here */
  reactStrictMode: false,
  turbopack: {
    resolveAlias: {
      // @mintplex-labs/piper-tts-web ships emscripten glue code with a
      // dead ENVIRONMENT_IS_NODE branch that statically references these
      // Node built-ins. They never run in the browser, but Turbopack
      // still needs something resolvable to bundle.
      fs: "./src/lib/empty-module.js",
      path: "./src/lib/empty-module.js",
    },
  },
};

export default nextConfig;
