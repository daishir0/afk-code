---
name: gemini
description: Google Gemini APIを使ったテキスト・画像クエリ処理
---

# Google Gemini API

Google Gemini APIを使用して、テキストや画像に対するクエリを実行するスキルです。

## 前提条件

- `env.yaml` に `gemini_api_key` を設定済みであること
- `requests` パッケージがインストール済みであること

### env.yaml設定例

```yaml
gemini_api_key: AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX
```

### パッケージインストール

```bash
source ~/.claude/lib/load_env.sh
run_python -m pip install requests
```

## 使い方

### テキストクエリ

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/gemini/script.py "日本の首都はどこですか？"
```

### 画像付きクエリ

```bash
# ローカル画像ファイルを分析
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/gemini/script.py "この画像に何が写っていますか？" --image /path/to/image.jpg

# 画像URLを指定
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/gemini/script.py "この画像を説明してください" --image-url "https://example.com/image.jpg"
```

### オプション指定

```bash
# モデル指定
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/gemini/script.py "要約してください" --model gemini-2.0-flash

# 結果をファイルに保存
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/gemini/script.py "詳細な分析をしてください" --output result.txt

# 最大トークン数の指定
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/gemini/script.py "短く答えてください" --max-tokens 256

# 温度パラメータの指定
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/gemini/script.py "創造的な物語を書いてください" --temperature 0.9
```

## 引数

| 引数 | 必須 | 説明 | デフォルト |
|------|------|------|-----------|
| prompt | はい | テキストプロンプト | - |
| --image | いいえ | ローカル画像ファイルパス | なし |
| --image-url | いいえ | 画像URL | なし |
| --model | いいえ | モデル名 | gemini-2.0-flash |
| --output | いいえ | 出力ファイル名 | なし（標準出力のみ） |
| --max-tokens | いいえ | 最大出力トークン数 | 8192 |
| --temperature | いいえ | 温度パラメータ (0.0-2.0) | 1.0 |

## 対応モデル

- `gemini-2.0-flash` (デフォルト、高速)
- `gemini-2.0-flash-lite` (最速、軽量)
- `gemini-2.5-pro-preview-05-06` (最高精度)
- `gemini-2.5-flash-preview-04-17` (バランス型)

## 出力

- 結果は標準出力に表示されます
- `--output` を指定した場合は `./outputs/` ディレクトリにも保存されます
