import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node22"],
  sourcemap: true,
  external: ["mysql2"],
  banner: {
    js: [
      `import { createRequire } from "module";`,
      `import { fileURLToPath } from "url";`,
      `import { dirname as pathDirname } from "path";`,
      `const require = createRequire(import.meta.url);`,
      `const __filename = fileURLToPath(import.meta.url);`,
      `const __dirname = pathDirname(__filename);`,
    ].join("\n"),
  },
});
