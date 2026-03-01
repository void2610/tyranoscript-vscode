# TyranoScript for Visual Studio Code

[English](README.md)

[TyranoScript](https://tyranoscript.jp/)（`.ks` ファイル）向け VSCode 拡張機能です。

## 機能

- **シンタックスハイライト** — コメント、ラベル、タグ、属性、話者行、埋め込み JavaScript ブロック
- **コード補完** — タグ名、属性名、属性値
- **ホバードキュメント** — 組み込みタグのドキュメント表示
- **定義へジャンプ** — ラベル定義行へジャンプ
- **診断** — 不正な構文のエラー・警告

## 動作要件

- Visual Studio Code 1.85.0 以降

## シンタックスハイライト

| 要素 | 例 |
|---|---|
| コメント | `; これはコメント` |
| ラベル | `*start` |
| 話者 | `#Alice` |
| タグ | `[bg storage="bg01.jpg"]` |
| 制御タグ | `[if exp="tf.flag"]` |
| 埋め込み JS | `[iscript] ... [endscript]` |

`[iscript]` と `[endscript]` の間の JavaScript は JavaScript としてハイライトされます。

## Language Server

[@void2610/tyranoscript-lsp](https://github.com/void2610/tyranoscript-lsp) を使用しています。

## ライセンス

MIT
