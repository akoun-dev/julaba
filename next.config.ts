import type { NextConfig } from "next";

const devScriptPolicy = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "146.59.230.23",
    "preview-chat-dac31483-eac3-4b73-9cc1-70a900324611.space-z.ai",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'wasm-unsafe-eval' : la compilation WebAssembly (ONNX Runtime
              // de Kokoro, piper-tts-web, espeak-ng WASM) est bloquée par la
              // CSP sans cette source — en production (sans 'unsafe-eval'),
              // l'instanciation du moteur échouait APRES le téléchargement du
              // modèle (« no available backend found … violates the following
              // Content Security policy directive »), d'où des voix qui
              // « ne se téléchargent jamais ». Voir kokoro-tts.ts / piper-tts.ts.
              `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${devScriptPolicy} blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net`,
              "script-src-elem 'self' 'unsafe-inline' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https:",
              "connect-src 'self' https: wss:",
              "worker-src 'self' blob:",
              "media-src 'self' blob: data:",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
  /* config options here */
  reactStrictMode: false,
  // Webpack (secours quand Turbopack dépasse la RAM du conteneur de build) :
  // même neutralisation fs/path que turbopack.resolveAlias ci-dessous.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      fs: "./src/lib/empty-module.js",
      path: "./src/lib/empty-module.js",
    };
    return config;
  },
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
