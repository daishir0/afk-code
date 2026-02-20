---
name: weather
description: wttr.in APIを使用して天気情報を取得するスキル（APIキー不要、どのOSでも動作）
---

# Weather スキル

wttr.in APIを使用して天気情報を取得します。APIキーは不要で、curlコマンドのみで動作します。

## 前提条件

- `curl` コマンドが利用可能であること（macOS/Linux標準搭載）
- インターネット接続

## 基本的な使い方

### 1. 都市名を指定して天気を取得

```bash
curl -s "wttr.in/Tokyo?lang=ja"
```

日本語で取得する場合は `?lang=ja` を付与します。

### 2. コンパクトなワンライン表示

```bash
curl -s "wttr.in/Tokyo?format=%l:+%c+%t+%h+%w&lang=ja"
```

出力例: `Tokyo: ☀️ +15°C 45% ↗11km/h`

### 3. 各種フォーマットオプション

| フォーマット | 説明 | 例 |
|---|---|---|
| `%l` | 場所名 | Tokyo |
| `%c` | 天気アイコン | ☀️ |
| `%C` | 天気テキスト | Sunny |
| `%t` | 気温 | +15°C |
| `%f` | 体感温度 | +13°C |
| `%h` | 湿度 | 45% |
| `%w` | 風速・風向 | ↗11km/h |
| `%p` | 降水量 | 0.0mm |
| `%P` | 気圧 | 1015hPa |
| `%D` | 夜明け | 06:15 |
| `%S` | 日の出 | 06:42 |
| `%s` | 日の入り | 17:35 |
| `%d` | 日暮れ | 18:02 |
| `%m` | 月の満ち欠け | 🌗 |
| `%M` | 月齢 | 22 |

### 4. 複数日の予報

```bash
# 今日のみ
curl -s "wttr.in/Tokyo?0&lang=ja"

# 今日と明日
curl -s "wttr.in/Tokyo?1&lang=ja"

# 3日間予報（デフォルト）
curl -s "wttr.in/Tokyo?lang=ja"
```

### 5. JSON形式で取得

```bash
curl -s "wttr.in/Tokyo?format=j1"
```

JSON形式はプログラム処理に適しています。jqと組み合わせて必要な情報を抽出できます。

```bash
# 現在の気温のみ抽出
curl -s "wttr.in/Tokyo?format=j1" | jq '.current_condition[0].temp_C'

# 現在の天気概要
curl -s "wttr.in/Tokyo?format=j1" | jq '.current_condition[0] | {temp: .temp_C, humidity: .humidity, description: .weatherDesc[0].value}'
```

### 6. 日本の主要都市の天気

```bash
# 複数都市をまとめて取得
for city in Tokyo Osaka Nagoya Fukuoka Sapporo; do
    echo "--- $city ---"
    curl -s "wttr.in/${city}?format=%l:+%c+%t+%h+%w"
    echo ""
done
```

### 7. 場所の指定方法

```bash
# 都市名（英語）
curl -s "wttr.in/Tokyo"

# 都市名（日本語 - URLエンコードが必要）
curl -s "wttr.in/東京"

# 空港コード
curl -s "wttr.in/NRT"

# 緯度経度
curl -s "wttr.in/35.6762,139.6503"

# ランドマーク名
curl -s "wttr.in/Tokyo+Tower"
```

### 8. PNG画像で取得

```bash
curl -s "wttr.in/Tokyo.png" -o ./outputs/weather_tokyo.png
```

## よく使うパターン

### 簡潔な現在の天気レポート

```bash
curl -s "wttr.in/Tokyo?format=%l:+%C+%c+気温%t+体感%f+湿度%h+風%w&lang=ja"
```

### 雨が降るか確認

```bash
curl -s "wttr.in/Tokyo?format=j1" | jq '.weather[0].hourly[] | select(.chanceofrain | tonumber > 30) | {time: .time, rain_chance: .chanceofrain, desc: .weatherDesc[0].value}'
```

## 注意事項

- wttr.in は無料サービスのため、過度なリクエストは避けること
- レスポンスに時間がかかる場合がある（タイムアウト設定推奨: `curl -s --max-time 10`）
- 都市名が曖昧な場合、意図しない場所の天気が返ることがある（英語の正式名を推奨）
