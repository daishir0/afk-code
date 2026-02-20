---
name: openai-image-gen
description: DALL-E画像生成 - OpenAI APIを使ってプロンプトから画像を生成
---

# OpenAI DALL-E 画像生成

OpenAI DALL-E APIを使用して、テキストプロンプトから画像を生成するスキルです。

## 前提条件

- `env.yaml` に `openai_api_key` を設定済みであること
- `requests` パッケージがインストール済みであること

### env.yaml設定例

```yaml
openai_api_key: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### パッケージインストール

```bash
source ~/.claude/lib/load_env.sh
run_python -m pip install requests
```

## 使い方

### 基本的な画像生成

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-image-gen/script.py "A beautiful sunset over mountains"
```

### オプション指定

```bash
# サイズ指定 (1024x1024, 1024x1792, 1792x1024)
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-image-gen/script.py "A cat wearing a hat" --size 1792x1024

# モデル指定 (dall-e-2, dall-e-3)
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-image-gen/script.py "A cat wearing a hat" --model dall-e-3

# 品質指定 (standard, hd) ※dall-e-3のみ
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-image-gen/script.py "A cat wearing a hat" --quality hd

# 出力ファイル名指定
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-image-gen/script.py "A cat wearing a hat" --output my_image.png
```

## 引数

| 引数 | 必須 | 説明 | デフォルト |
|------|------|------|-----------|
| prompt | はい | 画像生成プロンプト（英語推奨） | - |
| --size | いいえ | 画像サイズ | 1024x1024 |
| --model | いいえ | モデル名 | dall-e-3 |
| --quality | いいえ | 品質 (standard/hd) | standard |
| --output | いいえ | 出力ファイル名 | generated_image.png |

## 出力

- 生成された画像は `./outputs/` ディレクトリに保存されます
- ファイルパスが標準出力に出力されます
