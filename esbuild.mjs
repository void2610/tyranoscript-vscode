// ビルドスクリプト
// vscode-languageclient を extension.js にバンドルする
// vscode モジュールは VSCode ランタイムが提供するため external にする
import esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const buildTest = process.argv.includes("--test");

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  outfile: "dist/extension.js",
  sourcemap: true,
  minify: !watch && !buildTest,
};

/** @type {import('esbuild').BuildOptions} */
const testRunnerOptions = {
  entryPoints: ["src/test/runTests.ts"],
  bundle: true,
  external: ["vscode", "@vscode/test-electron"],
  format: "cjs",
  platform: "node",
  outfile: "dist/test/runTests.js",
  sourcemap: true,
};

/** @type {import('esbuild').BuildOptions} */
const testSuiteOptions = {
  entryPoints: [
    "src/test/suite/index.ts",
    "src/test/suite/grammar.test.ts",
  ],
  bundle: true,
  external: ["vscode", "mocha"],
  format: "cjs",
  platform: "node",
  outdir: "dist/test/suite",
  sourcemap: true,
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("ウォッチモード開始...");
} else if (buildTest) {
  await Promise.all([
    esbuild.build(buildOptions),
    esbuild.build(testRunnerOptions),
    esbuild.build(testSuiteOptions),
  ]);
  console.log("ビルド完了: extension.js + テスト");
} else {
  await esbuild.build(buildOptions);
  console.log("ビルド完了: dist/extension.js");
}
