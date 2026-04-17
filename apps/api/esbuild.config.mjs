import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts", "src/worker.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node22"],
  sourcemap: true,
  external: ["mysql2"],
  banner: {
    js: [
      `import { createRequire as __codexCreateRequire } from "module";`,
      `import { fileURLToPath as __codexFileURLToPath } from "url";`,
      `import { dirname as __codexPathDirname } from "path";`,
      `const require = __codexCreateRequire(import.meta.url);`,
      `const __filename = __codexFileURLToPath(import.meta.url);`,
      `const __dirname = __codexPathDirname(__filename);`,
    ].join("\n"),
  },
});
