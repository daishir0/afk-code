---
name: peekaboo
description: macOSのscreencaptureコマンドを使ってスクリーンショットを撮影するスキル（フルスクリーン・ウィンドウ・範囲指定対応）
---

# Peekaboo スキル

macOS標準搭載の `screencapture` コマンドを使って、スクリーンショットを撮影します。
追加インストールは不要です。

## 前提条件

- macOS環境であること
- `screencapture` コマンドが使用可能であること（標準搭載）
- 画面収録の権限が付与されていること（システム環境設定 > プライバシーとセキュリティ > 画面収録）

## 操作一覧

### 1. フルスクリーンキャプチャ

画面全体をキャプチャして `./outputs/` に保存:

```bash
mkdir -p ./outputs
screencapture ./outputs/screenshot_$(date +%Y%m%d_%H%M%S).png
```

### 2. マルチディスプレイ環境での全画面キャプチャ

複数ディスプレイがある場合、各ディスプレイが別ファイルとして保存されます:

```bash
mkdir -p ./outputs
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
screencapture ./outputs/screen1_${TIMESTAMP}.png ./outputs/screen2_${TIMESTAMP}.png
```

### 3. インタラクティブなウィンドウ選択キャプチャ

ユーザーがウィンドウをクリックして選択:

```bash
mkdir -p ./outputs
screencapture -w ./outputs/window_$(date +%Y%m%d_%H%M%S).png
```

**注意**: `-w` オプションはインタラクティブ操作を必要とするため、自動化には向きません。

### 4. インタラクティブな範囲選択キャプチャ

ユーザーがドラッグで範囲を選択:

```bash
mkdir -p ./outputs
screencapture -i ./outputs/region_$(date +%Y%m%d_%H%M%S).png
```

**注意**: `-i` オプションもインタラクティブ操作を必要とします。

### 5. 非インタラクティブ（サイレント）キャプチャ

シャッター音を鳴らさずに撮影:

```bash
mkdir -p ./outputs
screencapture -x ./outputs/screenshot_$(date +%Y%m%d_%H%M%S).png
```

`-x` オプションでシャッター音を無効にします。自動化時に推奨。

### 6. JPEG形式で保存

```bash
mkdir -p ./outputs
screencapture -t jpg ./outputs/screenshot_$(date +%Y%m%d_%H%M%S).jpg
```

`-t` オプションで形式を指定。対応形式: `png`（デフォルト）, `jpg`, `tiff`, `bmp`, `gif`, `pdf`

### 7. タイムスタンプ付きでPDF保存

```bash
mkdir -p ./outputs
screencapture -t pdf ./outputs/screenshot_$(date +%Y%m%d_%H%M%S).pdf
```

### 8. クリップボードにコピー（ファイル保存なし）

```bash
screencapture -c
```

クリップボードにコピーされるので、プレビュー等にペーストして確認できます。

### 9. 遅延撮影（タイマー）

指定秒数後に撮影（例: 5秒後）:

```bash
mkdir -p ./outputs
screencapture -T 5 ./outputs/screenshot_$(date +%Y%m%d_%H%M%S).png
```

メニューやドロップダウンを表示した状態をキャプチャしたい場合に便利です。

### 10. ウィンドウの影を除外

ウィンドウキャプチャ時にウィンドウの影を含めない:

```bash
mkdir -p ./outputs
screencapture -o -w ./outputs/window_noshadow_$(date +%Y%m%d_%H%M%S).png
```

### 11. カーソルを含めてキャプチャ

```bash
mkdir -p ./outputs
screencapture -C ./outputs/screenshot_with_cursor_$(date +%Y%m%d_%H%M%S).png
```

### 12. Retinaディスプレイで低解像度キャプチャ

Retinaディスプレイで1xスケールのキャプチャ（ファイルサイズ削減）:

```bash
mkdir -p ./outputs
screencapture -r ./outputs/screenshot_1x_$(date +%Y%m%d_%H%M%S).png
```

## よく使うパターン

### 自動化向け: サイレント + フルスクリーン

```bash
mkdir -p ./outputs
OUTPUT="./outputs/screenshot_$(date +%Y%m%d_%H%M%S).png"
screencapture -x "$OUTPUT"
echo "Screenshot saved: $OUTPUT"
ls -la "$OUTPUT"
```

### 連続キャプチャ（定期的に撮影）

```bash
mkdir -p ./outputs
for i in $(seq 1 5); do
    screencapture -x "./outputs/capture_${i}.png"
    sleep 2
done
echo "5 screenshots captured"
```

### スクリーンショットを撮ってSlackに送信

```bash
mkdir -p ./outputs
OUTPUT="./outputs/screenshot_$(date +%Y%m%d_%H%M%S).png"
screencapture -x "$OUTPUT"
echo "Captured: $OUTPUT"
```

その後、slack-notifyスキルで `$OUTPUT` のファイルを送信します。

## screencapture コマンドの主要オプション一覧

| オプション | 説明 |
|---|---|
| `-c` | クリップボードにコピー |
| `-C` | カーソルを含める |
| `-i` | インタラクティブ範囲選択 |
| `-w` | インタラクティブウィンドウ選択 |
| `-x` | サイレント（シャッター音なし） |
| `-o` | ウィンドウの影を除外 |
| `-r` | Retina低解像度モード |
| `-t <format>` | 出力形式指定（png/jpg/tiff/bmp/gif/pdf） |
| `-T <seconds>` | タイマー撮影（秒数指定） |
| `-R <x,y,w,h>` | 指定矩形領域をキャプチャ |
| `-D <display>` | キャプチャするディスプレイ番号 |

### 矩形領域の指定（非インタラクティブ）

座標とサイズを直接指定してキャプチャ（自動化に最適）:

```bash
mkdir -p ./outputs
# x=100, y=200 の位置から 幅800 x 高さ600 の範囲をキャプチャ
screencapture -R 100,200,800,600 ./outputs/region_$(date +%Y%m%d_%H%M%S).png
```

### 特定ディスプレイのキャプチャ

```bash
mkdir -p ./outputs
# ディスプレイ1をキャプチャ
screencapture -D 1 ./outputs/display1_$(date +%Y%m%d_%H%M%S).png

# ディスプレイ2をキャプチャ
screencapture -D 2 ./outputs/display2_$(date +%Y%m%d_%H%M%S).png
```

## 注意事項

- ターミナル（またはClaude Code）に「画面収録」権限を付与する必要がある（システム環境設定 > プライバシーとセキュリティ > 画面収録）
- 権限がない場合、デスクトップの壁紙のみがキャプチャされる（ウィンドウ内容が映らない）
- `-i` と `-w` はインタラクティブ操作が必要なため、自動実行時はフルスクリーンキャプチャ（オプションなし）または `-R` による矩形指定を使用すること
- macOS Ventura以降では画面収録権限のダイアログが表示される場合がある
