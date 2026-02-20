---
name: sherpa-onnx-tts
description: sherpa-onnxを使ったローカルText-to-Speech音声合成（APIキー不要）
---

# sherpa-onnx Text-to-Speech 音声合成

sherpa-onnxを使用して、テキストから音声を生成するスキルです。
APIキーは不要で、完全にオフラインで動作します。

## 前提条件

- sherpa-onnx（Pythonパッケージまたはバイナリ）がインストール済みであること
- TTSモデルがダウンロード済みであること

## セットアップ

### 方法1: Pythonパッケージ

```bash
source ~/.claude/lib/load_env.sh
run_python -m pip install sherpa-onnx
```

### 方法2: バイナリからビルド

```bash
git clone https://github.com/k2-fsa/sherpa-onnx.git
cd sherpa-onnx
cmake -B build -DCMAKE_BUILD_TYPE=Release -DSHERPA_ONNX_ENABLE_TTS=ON
cmake --build build --config Release -j 4
```

### モデルのダウンロード

sherpa-onnxは多数のTTSモデルに対応しています。以下は主要なモデルです。

#### 日本語モデル

```bash
# VITS日本語モデル
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-icefall-zh-aishell3.tar.bz2
tar xf vits-icefall-zh-aishell3.tar.bz2
```

#### 英語モデル

```bash
# VITS英語モデル (LJSpeech)
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-ljs.tar.bz2
tar xf vits-ljs.tar.bz2
```

#### 多言語モデル (Piper)

```bash
# Piper英語モデル（高品質）
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-medium.tar.bz2
tar xf vits-piper-en_US-amy-medium.tar.bz2

# Piper日本語モデル
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ja_JP-amitaro-medium.tar.bz2
tar xf vits-piper-ja_JP-amitaro-medium.tar.bz2
```

モデル一覧: https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models

## 使い方

### Python APIを使う方法

```python
import sherpa_onnx

# TTS設定
tts_config = sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model="/path/to/model.onnx",
            tokens="/path/to/tokens.txt",
            data_dir="/path/to/espeak-ng-data",  # Piperモデルの場合
        ),
        provider="cpu",
        num_threads=4,
    ),
    max_num_sentences=1,
)

tts = sherpa_onnx.OfflineTts(tts_config)

# 音声生成
audio = tts.generate("Hello, this is a test.", sid=0, speed=1.0)

# WAVファイルに保存
import soundfile as sf
sf.write("./outputs/output.wav", audio.samples, audio.sample_rate)
```

### CLIを使う方法

```bash
# sherpa-onnx-offline-tts バイナリを使用
/path/to/sherpa-onnx-offline-tts \
  --vits-model=/path/to/model.onnx \
  --vits-tokens=/path/to/tokens.txt \
  --vits-data-dir=/path/to/espeak-ng-data \
  --output-filename=./outputs/output.wav \
  --sid=0 \
  --speed=1.0 \
  "Hello, this is a test."
```

### Piperモデルでの使用例

```bash
# Piper英語モデル (Amy)
sherpa-onnx-offline-tts \
  --vits-model=vits-piper-en_US-amy-medium/en_US-amy-medium.onnx \
  --vits-tokens=vits-piper-en_US-amy-medium/tokens.txt \
  --vits-data-dir=vits-piper-en_US-amy-medium/espeak-ng-data \
  --output-filename=./outputs/speech.wav \
  "The quick brown fox jumps over the lazy dog."
```

## 主要オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| --vits-model | ONNXモデルファイルパス | (必須) |
| --vits-tokens | トークンファイルパス | (必須) |
| --vits-data-dir | espeak-ngデータディレクトリ | Piperモデル時のみ |
| --vits-dict-dir | 辞書ディレクトリ | 一部モデル |
| --output-filename | 出力WAVファイルパス | (必須) |
| --sid | スピーカーID（マルチスピーカーモデル） | 0 |
| --speed | 発話速度（1.0が標準） | 1.0 |
| --num-threads | 処理スレッド数 | 1 |

## 出力

- 生成された音声は `./outputs/` ディレクトリにWAV形式で保存されます

## トラブルシューティング

- **「Model not found」**: モデルファイルのパスを確認。ダウンロードが完了しているか確認。
- **日本語が正しく読めない**: 日本語対応モデルを使用しているか確認。
- **音質が低い**: `medium` または `high` 品質のモデルに変更。
- **処理速度が遅い**: `--num-threads` を増やす。GPUが利用可能な場合は `--provider=cuda` を試す。
