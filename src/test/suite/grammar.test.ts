// 実際のVSCodeプロセス内でgrammarをトークン化してスコープをテストする
// vscode-textmate をVSCodeのnode_modulesから直接ロードしてVSCodeと同一のエンジンを使用
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';

// VSCode内部のvscode-textmate と vscode-oniguruma を使用
// Extension Host の process.execPath = .../Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)
// そこから 4階層上 → Contents → Resources/app
const vscodeRoot = path.resolve(path.dirname(process.execPath), '../../../..', 'Resources', 'app');
const tmPath = path.join(vscodeRoot, 'node_modules', 'vscode-textmate', 'release', 'main.js');
const onigPath = path.join(vscodeRoot, 'node_modules', 'vscode-oniguruma', 'release', 'main.js');
const onigWasmPath = path.join(vscodeRoot, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm');
const jsGrammarPath = path.join(vscodeRoot, 'extensions', 'javascript', 'syntaxes', 'JavaScript.tmLanguage.json');
const jsdocInjectPath = path.join(vscodeRoot, 'extensions', 'typescript-basics', 'syntaxes', 'jsdoc.js.injection.tmLanguage.json');
const tyranoscriptGrammarPath = path.resolve(__dirname, '../../../syntaxes/tyranoscript.tmLanguage.json');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tm = require(tmPath);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const oniguruma = require(onigPath);

suite('TyranoScript Grammar Tests', () => {

  let grammar: any;

  suiteSetup(async () => {
    const { loadWASM, createOnigScanner, createOnigString } = oniguruma;
    const wasmBin = fs.readFileSync(onigWasmPath).buffer;
    await loadWASM(wasmBin);

    const { Registry } = tm;
    const registry = new Registry({
      onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
      loadGrammar: async (scopeName: string) => {
        if (scopeName === 'source.tyranoscript') {
          return JSON.parse(fs.readFileSync(tyranoscriptGrammarPath, 'utf8'));
        }
        if (scopeName === 'source.js') {
          return JSON.parse(fs.readFileSync(jsGrammarPath, 'utf8'));
        }
        if (scopeName === 'documentation.injection.js.jsx') {
          return JSON.parse(fs.readFileSync(jsdocInjectPath, 'utf8'));
        }
        return null;
      },
    });

    // VSCodeと同じ順序でinjection grammarを先にロード
    await registry.loadGrammar('documentation.injection.js.jsx');

    // VSCodeと同じく loadGrammarWithConfiguration を使用
    grammar = await registry.loadGrammarWithConfiguration(
      'source.tyranoscript',
      100,
      {
        embeddedLanguages: { 'source.js': 2 },
        tokenTypes: {},
        balancedBracketSelectors: undefined,
        unbalancedBracketSelectors: undefined,
      }
    );
  });

  // 指定行のスコープを取得するヘルパー
  function tokenizeLines(lines: string[]): Array<Array<{ text: string; scopes: string[] }>> {
    const { INITIAL } = tm;
    let ruleStack = INITIAL;
    return lines.map(line => {
      const result = grammar.tokenizeLine(line, ruleStack);
      ruleStack = result.ruleStack;
      return result.tokens.map((t: any) => ({
        text: line.slice(t.startIndex, t.endIndex),
        scopes: t.scopes,
      }));
    });
  }

  test('[iscript] は keyword.control.tyranoscript になる', () => {
    const results = tokenizeLines(['[iscript]']);
    const token = results[0][0];
    assert.strictEqual(token.text, '[iscript]');
    assert.ok(token.scopes.includes('keyword.control.tyranoscript'), `実際のスコープ: ${token.scopes.join(', ')}`);
  });

  test('[endscript] は keyword.control.tyranoscript になる（source.js に消費されない）', () => {
    const lines = ['[iscript]', 'var x = 1;', '[endscript]'];
    const results = tokenizeLines(lines);
    const endscriptLine = results[2];
    const allText = endscriptLine.map(t => t.text).join('');
    assert.strictEqual(allText, '[endscript]');
    const hasKeyword = endscriptLine.some(t => t.scopes.includes('keyword.control.tyranoscript'));
    const hasJsArray = endscriptLine.some(t => t.scopes.includes('meta.array.literal.js'));
    assert.ok(hasKeyword, `[endscript] に keyword.control.tyranoscript がない。実際: ${endscriptLine.map(t => t.scopes.join('+')).join(' | ')}`);
    assert.ok(!hasJsArray, `[endscript] が meta.array.literal.js として認識されている。実際: ${endscriptLine.map(t => t.scopes.join('+')).join(' | ')}`);
  });

  test('インデントされた [endscript] は keyword.control.tyranoscript になる', () => {
    const lines = ['[iscript]', 'var x = 1;', '  [endscript]'];
    const results = tokenizeLines(lines);
    const endscriptLine = results[2];
    const hasKeyword = endscriptLine.some(t => t.scopes.includes('keyword.control.tyranoscript'));
    const hasJsArray = endscriptLine.some(t => t.scopes.includes('meta.array.literal.js'));
    assert.ok(hasKeyword, `インデントされた [endscript] に keyword.control.tyranoscript がない。実際: ${endscriptLine.map(t => t.scopes.join('+')).join(' | ')}`);
    assert.ok(!hasJsArray, `インデントされた [endscript] が meta.array.literal.js として認識されている。実際: ${endscriptLine.map(t => t.scopes.join('+')).join(' | ')}`);
  });

  test('[endscript] 後のコメントは comment.line.semicolon.tyranoscript になる', () => {
    const lines = ['[iscript]', 'var x = 1;', '[endscript]', '; コメント'];
    const results = tokenizeLines(lines);
    const commentLine = results[3];
    const hasComment = commentLine.some(t => t.scopes.some(s => s.startsWith('comment.line.semicolon.tyranoscript')));
    assert.ok(hasComment, `コメントが正しく認識されていない。実際: ${commentLine.map(t => t.scopes.join('+')).join(' | ')}`);
  });

  test('iscript 内の JS コードは source.js スコープを持つ', () => {
    const lines = ['[iscript]', 'var x = 1;'];
    const results = tokenizeLines(lines);
    const jsLine = results[1];
    const hasJsScope = jsLine.some(t => t.scopes.some(s => s.endsWith('.js')));
    assert.ok(hasJsScope, `JSコードにJSスコープがない。実際: ${jsLine.map(t => t.scopes.join('+')).join(' | ')}`);
  });

  test('iscript 内の if はスコープスタックに source.js を含む', () => {
    const lines = ['[iscript]', 'if(x){'];
    const results = tokenizeLines(lines);
    const jsLine = results[1];
    const ifToken = jsLine.find(t => t.text === 'if');
    assert.ok(ifToken, 'if トークンが見つからない');
    // スコープスタックに source.js が含まれることでテーマが正しくJSを認識する
    assert.ok(ifToken!.scopes.includes('source.js'), `if のスコープスタックに source.js がない。実際: ${ifToken!.scopes.join(', ')}`);
    // keyword.control 系のスコープがあること（conditional.js など）
    assert.ok(ifToken!.scopes.some(s => s.startsWith('keyword.control')), `if に keyword.control 系スコープがない。実際: ${ifToken!.scopes.join(', ')}`);
  });
});
