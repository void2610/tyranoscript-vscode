// TyranoScript VSCode拡張機能のエントリーポイント
// vscode-languageclient を使って LSPサーバー（@void2610/tyranoscript-lsp）を起動する
import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

// グローバルクライアントインスタンス（deactivate 時に参照するため）
let client: LanguageClient;

export function activate(context: vscode.ExtensionContext): void {
  // npm パッケージ @void2610/tyranoscript-lsp の dist/server.js を参照する
  const serverModule = context.asAbsolutePath(
    path.join("node_modules", "@void2610", "tyranoscript-lsp", "dist", "server.js")
  );

  // LSPサーバーの起動オプション（stdio でクライアントと通信）
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    // 開発時デバッグ用: --inspect=6009 でブレークポイント設定可能
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: {
        execArgv: ["--nolazy", "--inspect=6009"],
      },
    },
  };

  // クライアント側の設定: .ks ファイルのみを対象とする
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "tyranoscript" },
    ],
    // .ks ファイルの変更を監視してインデックスを最新に保つ
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.ks"),
    },
  };

  // LSPクライアントを生成・起動し、拡張機能の生存期間にバインドする
  client = new LanguageClient(
    "tyranoscript",
    "TyranoScript Language Server",
    serverOptions,
    clientOptions
  );

  client.start();
  context.subscriptions.push(client);
}

export function deactivate(): Thenable<void> | undefined {
  // 拡張機能停止時に LSPサーバーも停止する
  if (!client) {
    return undefined;
  }
  return client.stop();
}
