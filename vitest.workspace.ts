import path from "path";
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
import react from "@vitejs/plugin-react";

export default [
  // Client-side project
  {
    name: "client",
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      name: "client",
      environment: "jsdom",
      globals: true,
      include: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/shared/**/*.{test,spec}.ts",
      ],
      exclude: ["src/worker/**/*.{test,spec}.ts"],
      setupFiles: ["src/tests/setup-client.ts"],
    },
  },
  // Worker-side project
  defineWorkersProject({
    test: {
      name: "worker",
      include: ["src/worker/**/*.{test,spec}.ts"],
      pool: "@cloudflare/vitest-pool-workers",
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.jsonc" },
        },
      },
      setupFiles: ["src/tests/setup-worker.ts"],
    },
  }),
];
