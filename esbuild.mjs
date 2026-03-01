// ビルドスクリプト
// vscode-languageclient を extension.js にバンドルする
// vscode モジュールは VSCode ランタイムが提供するため external にする
import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  outfile: "dist/extension.js",
  sourcemap: true,
  minify: !watch,
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("ウォッチモード開始...");
} else {
  await esbuild.build(buildOptions);
  console.log("ビルド完了: dist/extension.js");
}
