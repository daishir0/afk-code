---
name: camsnap
description: macOSでimagesnap（Homebrew）を使ってカメラ撮影を行うスキル
---

# Camsnap スキル

macOSの内蔵カメラ（またはUSBカメラ）を使って写真を撮影します。
`imagesnap` コマンドを使用します。

## 前提条件

- macOS環境であること
- `imagesnap` がインストールされていること

### imagesnap のインストール

```bash
brew install imagesnap
```

インストール確認:

```bash
which imagesnap && echo "imagesnap is installed" || echo "imagesnap is NOT installed"
```

## 操作一覧

### 1. 基本的な撮影

デフォルトカメラで撮影し、`./outputs/` に保存:

```bash
mkdir -p ./outputs
imagesnap ./outputs/camera_$(date +%Y%m%d_%H%M%S).jpg
```

### 2. ウォームアップ時間を指定して撮影

カメラの起動に時間がかかる場合（暗い環境やUSBカメラなど）、ウォームアップ時間を設定:

```bash
mkdir -p ./outputs
imagesnap -w 2.0 ./outputs/camera_$(date +%Y%m%d_%H%M%S).jpg
```

`-w 2.0` はカメラ起動後2秒待ってから撮影します。デフォルトは約0.5秒。

### 3. 使用可能なカメラの一覧

```bash
imagesnap -l
```

出力例:
```
Video Devices:
<AVCaptureDALDevice: 0x...> [FaceTime HD Camera]
<AVCaptureDALDevice: 0x...> [USB Camera]
```

### 4. カメラを指定して撮影

```bash
mkdir -p ./outputs
imagesnap -d "FaceTime HD Camera" ./outputs/camera_$(date +%Y%m%d_%H%M%S).jpg
```

### 5. 連続撮影（タイムラプス）

指定間隔で連続撮影（例: 5秒間隔）:

```bash
mkdir -p ./outputs
imagesnap -t 5.0 ./outputs/timelapse
```

この場合、`./outputs/timelapse-0.jpg`, `./outputs/timelapse-1.jpg`, ... のように連番で保存されます。
Ctrl+C で停止します。

### 6. PNG形式で撮影

```bash
mkdir -p ./outputs
imagesnap ./outputs/camera_$(date +%Y%m%d_%H%M%S).png
```

拡張子を `.png` にすればPNG形式で保存されます。`.tiff` も対応しています。

### 7. ウォームアップなしで即座に撮影

```bash
mkdir -p ./outputs
imagesnap -w 0 ./outputs/camera_quick.jpg
```

### 8. 静音撮影（出力を抑制）

```bash
mkdir -p ./outputs
imagesnap -q ./outputs/camera_$(date +%Y%m%d_%H%M%S).jpg
```

`-q` オプションで標準出力へのメッセージを抑制します。

## よく使うパターン

### 撮影して結果を確認

```bash
mkdir -p ./outputs
OUTPUT="./outputs/camera_$(date +%Y%m%d_%H%M%S).jpg"
imagesnap -w 1.5 "$OUTPUT"
echo "Saved to: $OUTPUT"
ls -la "$OUTPUT"
```

### 撮影してSlackに送信

撮影後にslack-notifyスキルと組み合わせて使用:

```bash
mkdir -p ./outputs
OUTPUT="./outputs/camera_$(date +%Y%m%d_%H%M%S).jpg"
imagesnap -w 1.5 "$OUTPUT"
echo "Captured: $OUTPUT"
```

その後、slack-notifyスキルで `$OUTPUT` のファイルを送信します。

## 注意事項

- 初回実行時にカメラアクセス権限の許可ダイアログが表示される場合がある
- ターミナル（またはClaude Code）にカメラアクセス権限を付与する必要がある（システム環境設定 > プライバシーとセキュリティ > カメラ）
- ウォームアップ時間が短すぎると、暗い画像やブレた画像になることがある（`-w 1.5` 以上を推奨）
- Apple Silicon Mac では `imagesnap` の互換性を確認すること（Homebrewで最新版をインストールすれば通常問題なし）
- カメラがアプリ（Zoom, FaceTimeなど）に占有されている場合は撮影できない
