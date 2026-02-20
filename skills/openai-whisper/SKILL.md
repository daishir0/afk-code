---
name: openai-whisper
description: whisper.cppを使ったローカル音声文字起こし（APIキー不要）
---

# whisper.cpp ローカル音声文字起こし

whisper.cppを使用して、ローカル環境で音声ファイルをテキストに変換するスキルです。
APIキーは不要で、完全にオフラインで動作します。

## 前提条件

- whisper.cppがビルド済みであること
- 音声モデルファイルがダウンロード済みであること

## セットアップ

### 1. whisper.cppのビルド

```bash
# リポジトリをクローン
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# ビルド
cmake -B build
cmake --build build --config Release

# ビルド結果の確認
ls build/bin/whisper-cli
```

### 2. モデルのダウンロード

```bash
cd whisper.cpp

# 軽量モデル（推奨: 初回テスト用）
bash models/download-ggml-model.sh base

# 日本語に強いモデル
bash models/download-ggml-model.sh medium

# 最高精度モデル（大容量）
bash models/download-ggml-model.sh large-v3
```

利用可能なモデル:
- `tiny` (~75MB) - 最速、低精度
- `base` (~142MB) - 高速、基本精度
- `small` (~466MB) - バランス型
- `medium` (~1.5GB) - 高精度
- `large-v3` (~3.1GB) - 最高精度

## 使い方

### 基本的な文字起こし

```bash
# WAV形式の音声ファイルを文字起こし
/path/to/whisper.cpp/build/bin/whisper-cli \
  -m /path/to/whisper.cpp/models/ggml-base.bin \
  -f /path/to/audio.wav \
  -l ja
```

### 出力形式オプション

```bash
# テキスト出力（デフォルト）
whisper-cli -m models/ggml-base.bin -f audio.wav -otxt

# SRT字幕形式
whisper-cli -m models/ggml-base.bin -f audio.wav -osrt

# VTT字幕形式
whisper-cli -m models/ggml-base.bin -f audio.wav -ovtt

# JSON形式
whisper-cli -m models/ggml-base.bin -f audio.wav -ojf

# 全形式を出力
whisper-cli -m models/ggml-base.bin -f audio.wav -otxt -osrt -ovtt
```

### 音声ファイルの前処理

whisper.cppはWAV形式（16kHz, 16bit, mono）を要求します。ffmpegで変換できます:

```bash
# mp3/m4a/その他 → WAV変換
ffmpeg -i input.mp3 -ar 16000 -ac 1 -c:a pcm_s16le output.wav

# 動画から音声を抽出してWAV変換
ffmpeg -i video.mp4 -ar 16000 -ac 1 -c:a pcm_s16le audio.wav
```

### 主要オプション

| オプション | 説明 | 例 |
|-----------|------|-----|
| `-m` | モデルファイルパス | `-m models/ggml-base.bin` |
| `-f` | 入力音声ファイル | `-f audio.wav` |
| `-l` | 言語指定 | `-l ja` (日本語) |
| `-t` | スレッド数 | `-t 8` |
| `-otxt` | テキスト出力 | - |
| `-osrt` | SRT字幕出力 | - |
| `-ovtt` | VTT字幕出力 | - |
| `-ojf` | JSON出力 | - |
| `-of` | 出力ファイル名 | `-of ./outputs/result` |
| `--print-colors` | 信頼度の色表示 | - |
| `-pp` | タイムスタンプ表示 | - |

### 実行例

```bash
# 日本語音声をmediumモデルで文字起こし、結果をoutputsに保存
/path/to/whisper-cli \
  -m /path/to/models/ggml-medium.bin \
  -f audio.wav \
  -l ja \
  -t 8 \
  -otxt \
  -of ./outputs/transcript
```

## パフォーマンス目安

| モデル | 10分の音声 | メモリ使用量 |
|-------|-----------|-------------|
| tiny | ~10秒 | ~200MB |
| base | ~20秒 | ~500MB |
| small | ~1分 | ~1GB |
| medium | ~3分 | ~2.5GB |
| large-v3 | ~8分 | ~5GB |

※ CPU性能、OS、スレッド数により変動します。

## トラブルシューティング

- **「Failed to open file」**: 音声ファイルのパスを確認。WAV形式であることを確認。
- **「Failed to load model」**: モデルファイルのパスを確認。ダウンロードが完了しているか確認。
- **精度が低い**: より大きいモデルに変更。言語を明示的に指定（`-l ja`）。
- **処理が遅い**: スレッド数を増やす（`-t` オプション）。より小さいモデルに変更。
