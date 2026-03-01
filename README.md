# TyranoScript for Visual Studio Code

VSCode extension for [TyranoScript](https://tyranoscript.jp/) (`.ks` files).

## Features

- **Syntax highlighting** — comments, labels, tags, attributes, speaker lines, and embedded JavaScript blocks
- **Code completion** — tag names, attribute names, and values
- **Hover information** — documentation for built-in tags
- **Go to definition** — jump to label definitions
- **Diagnostics** — errors and warnings for invalid syntax

## Requirements

- Visual Studio Code 1.85.0 or later

## Syntax Highlighting

| Element | Example |
|---|---|
| Comment | `; this is a comment` |
| Label | `*start` |
| Speaker | `#Alice` |
| Tag | `[bg storage="bg01.jpg"]` |
| Control tag | `[if exp="tf.flag"]` |
| Embedded JS | `[iscript] ... [endscript]` |

Embedded JavaScript between `[iscript]` and `[endscript]` is highlighted as JavaScript.

## Language Server

Powered by [@void2610/tyranoscript-lsp](https://github.com/void2610/tyranoscript-lsp).

## License

MIT
