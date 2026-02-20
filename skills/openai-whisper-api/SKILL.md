---
name: openai-whisper-api
description: OpenAI Whisper APIによる音声文字起こし（Speech-to-Text）
---

# OpenAI Whisper API 音声文字起こし

OpenAI Whisper APIを使用して、音声ファイルをテキストに変換するスキルです。

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

### 基本的な文字起こし

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-whisper-api/script.py "/path/to/audio.mp3"
```

### オプション指定

```bash
# 言語指定（ISO 639-1コード）
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-whisper-api/script.py "/path/to/audio.mp3" --language ja

# タイムスタンプ付き出力
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-whisper-api/script.py "/path/to/audio.mp3" --timestamps

# 出力形式指定 (text, json, srt, vtt, verbose_json)
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-whisper-api/script.py "/path/to/audio.mp3" --format srt

# 出力ファイル名指定
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-whisper-api/script.py "/path/to/audio.mp3" --output transcript.txt

# プロンプト指定（文字起こしのヒント）
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/openai-whisper-api/script.py "/path/to/audio.mp3" --prompt "技術的な会議の議事録"
```

## 引数

| 引数 | 必須 | 説明 | デフォルト |
|------|------|------|-----------|
| audio_file | はい | 音声ファイルパス | - |
| --language | いいえ | 言語コード (ja, en等) | 自動検出 |
| --format | いいえ | 出力形式 | text |
| --timestamps | いいえ | タイムスタンプ出力 | false |
| --output | いいえ | 出力ファイル名 | transcript.txt |
| --prompt | いいえ | 文字起こしヒント | なし |

## 対応ファイル形式

mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac

## 出力

- 文字起こし結果は `./outputs/` ディレクトリに保存されます
- 標準出力にもテキストが出力されます
- ファイルサイズ上限: 25MB
