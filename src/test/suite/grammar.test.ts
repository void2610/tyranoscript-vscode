// 実際のVSCodeプロセス内でgrammarをトークン化してスコープをテストする
// 全インストール済み拡張機能のgrammarをロードして実際のVSCode環境を再現する
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

// VSCode内部のvscode-textmate と vscode-oniguruma を使用
const vscodeRoot = path.resolve(path.dirname(process.execPath), '../../../..', 'Resources', 'app');
const tmPath = path.join(vscodeRoot, 'node_modules', 'vscode-textmate', 'release', 'main.js');
const onigPath = path.join(vscodeRoot, 'node_modules', 'vscode-oniguruma', 'release', 'main.js');
const onigWasmPath = path.join(vscodeRoot, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm');
const tyranoscriptGrammarPath = path.resolve(__dirname, '../../../syntaxes/tyranoscript.tmLanguage.json');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tm = require(tmPath);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const oniguruma = require(onigPath);

/**
 * 全インストール済み拡張機能からscopeNameとgrammarファイルパスのマップを構築する
 * 実際のVSCode grammarレジストリを再現するために使用する
 */
function buildScopeToGrammarMap(): Map<string, string> {
  const scopeToPath = new Map<string, string>();
  for (const ext of vscode.extensions.all) {
    const grammars = (ext.packageJSON?.contributes?.grammars ?? []) as Array<{ scopeName?: string; path?: string }>;
    for (const grammar of grammars) {
      if (grammar.scopeName && grammar.path) {
        const grammarPath = path.join(ext.extensionPath, grammar.path);
        if (fs.existsSync(grammarPath)) {
          scopeToPath.set(grammar.scopeName, grammarPath);
        }
      }
    }
  }
  return scopeToPath;
}

/**
 * 全インストール済み拡張機能からinjection grammarのscopeNameリストを収集する
 * injection grammarは先にロードする必要がある
 */
function getInjectionGrammarScopes(): string[] {
  const injectionScopes: string[] = [];
  for (const ext of vscode.extensions.all) {
    const grammars = (ext.packageJSON?.contributes?.grammars ?? []) as Array<{ scopeName?: string; injectTo?: string[] }>;
    for (const grammar of grammars) {
      if (grammar.injectTo && grammar.scopeName) {
        injectionScopes.push(grammar.scopeName);
      }
    }
  }
  return injectionScopes;
}

suite('TyranoScript Grammar Tests', () => {

  let grammar: any;

  suiteSetup(async () => {
    const { loadWASM, createOnigScanner, createOnigString } = oniguruma;
    const wasmBin = fs.readFileSync(onigWasmPath).buffer;
    await loadWASM(wasmBin);

    // 実際のVSCode環境と同じgrammarsをロードするためのマップを構築
    // （手動でハードコードした3つだけでなく、全拡張機能のgrammarを含む）
    const scopeToPath = buildScopeToGrammarMap();

    const { Registry } = tm;
    const registry = new Registry({
      onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
      loadGrammar: async (scopeName: string) => {
        // テスト対象のgrammarは常にローカルファイルを使用（インストール済みバージョンではなく）
        if (scopeName === 'source.tyranoscript') {
          return JSON.parse(fs.readFileSync(tyranoscriptGrammarPath, 'utf8'));
        }
        // その他のgrammarは実際のVSCode環境からロード
        const grammarPath = scopeToPath.get(scopeName);
        if (grammarPath) {
          try {
            return JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
          } catch {
            return null;
          }
        }
        return null;
      },
    });

    // 全injection grammarを先にロード（実際のVSCode動作に合わせる）
    const injectionScopes = getInjectionGrammarScopes();
    for (const scopeName of injectionScopes) {
      try {
        await registry.loadGrammar(scopeName);
      } catch {
        // ロード失敗は無視（依存grammarが見つからない場合など）
      }
    }

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

  // tokenizeLine2 を使用してtokenTypeを取得するヘルパー
  // tokenType: 0=Other, 1=Comment, 2=String, 3=RegEx
  function tokenizeLines2(lines: string[]): Array<Array<{ text: string; tokenType: number }>> {
    const { INITIAL } = tm;
    let ruleStack = INITIAL;
    return lines.map(line => {
      const result = grammar.tokenizeLine2(line, ruleStack);
      ruleStack = result.ruleStack;
      const tokens: Uint32Array = result.tokens;
      const result2: Array<{ text: string; tokenType: number }> = [];
      for (let i = 0; i < tokens.length; i += 2) {
        const start = tokens[i];
        const end = i + 2 < tokens.length ? tokens[i + 2] : line.length;
        const metadata = tokens[i + 1];
        // TOKEN_TYPE_MASK = 0x700 (bits 8-10)
        const tokenType = (metadata & 0x700) >>> 8;
        result2.push({ text: line.slice(start, end), tokenType });
      }
      return result2;
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

  test('iscript 内のセミコロンは comment.line.semicolon.tyranoscript にならない', () => {
    const lines = ['[iscript]', 'tf.page = 0;', 'tf.obj = ""; // comment'];
    const results = tokenizeLines(lines);
    for (let i = 1; i < lines.length; i++) {
      const tokens = results[i];
      const badToken = tokens.find(t => t.scopes.includes('comment.line.semicolon.tyranoscript'));
      assert.ok(!badToken, `行${i}「${lines[i]}」にtyranoscriptコメントが誤適用: "${badToken?.text}" scopes: ${badToken?.scopes.join(', ')}`);
    }
  });

  test('iscript 内の // コメントは comment.line.double-slash.js になる', () => {
    // セミコロンの有無に関わらず // はJSコメントとして認識されるべき
    const linesWithSemicolon    = ['[iscript]', 'tf.obj = ""; // コメント'];
    const linesWithoutSemicolon = ['[iscript]', 'tf.obj = "" // コメント'];
    for (const lines of [linesWithSemicolon, linesWithoutSemicolon]) {
      const results = tokenizeLines(lines);
      const jsLine = results[1];
      const slashToken = jsLine.find(t => t.text.startsWith('//'));
      assert.ok(slashToken, `「${lines[1]}」 で // トークンが見つからない。実際: ${jsLine.map(t => `"${t.text}"`).join(', ')}`);
      assert.ok(
        slashToken.scopes.includes('comment.line.double-slash.js'),
        `「${lines[1]}」 の // が comment.line.double-slash.js でない。実際: ${slashToken.scopes.join(', ')}`
      );
      assert.ok(
        !slashToken.scopes.includes('comment.line.semicolon.tyranoscript'),
        `「${lines[1]}」 の // に TyranoScript コメントスコープが混入。実際: ${slashToken.scopes.join(', ')}`
      );
    }
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

  test('iscript 内のセミコロンの tokenType は Other (0) になる', () => {
    // tokenType が Comment (1) だと VS Code がセミコロン以降をコメント扱いにしてしまう
    const lines = ['[iscript]', 'tf.obj = "";'];
    const results = tokenizeLines2(lines);
    const jsLine = results[1];
    const semiToken = jsLine.find(t => t.text.includes(';'));
    assert.ok(semiToken, 'セミコロンを含むトークンが見つからない');
    assert.strictEqual(
      semiToken!.tokenType, 0,
      `iscript 内の ';' の tokenType が Other (0) でない: ${semiToken!.tokenType}。VS Code がセミコロンをコメント扱いする可能性がある`
    );
  });

  test('iscript 内の // コメントの tokenType は Comment (1) になる', () => {
    // tokenType が Comment (1) であることで VS Code が正しく JS コメントとして扱う
    const linesWithSemicolon    = ['[iscript]', 'tf.obj = ""; // コメント'];
    const linesWithoutSemicolon = ['[iscript]', 'tf.obj = "" // コメント'];
    for (const lines of [linesWithSemicolon, linesWithoutSemicolon]) {
      const results = tokenizeLines2(lines);
      const jsLine = results[1];
      const slashToken = jsLine.find(t => t.text.startsWith('//'));
      assert.ok(slashToken, `「${lines[1]}」 で // トークンが見つからない`);
      assert.strictEqual(
        slashToken!.tokenType, 1,
        `「${lines[1]}」 の // の tokenType が Comment (1) でない: ${slashToken!.tokenType}`
      );
    }
  });
});
