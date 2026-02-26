---
name: weather
description: ウェザーニュース(weathernews.jp)APIから天気情報を取得し、服装提案付きで表示するスキル（APIキー不要、どのOSでも動作）
tags: [weather, utility]
---

# Weather スキル

ウェザーニュース(weathernews.jp)のAPIから天気情報を取得します。APIキーは不要です。

## 機能

- 現在の天気（気温・体感温度・湿度・風速・気圧・降水量）
- 今日の予報（最高/最低気温・降水確率・日の出/日の入り）
- 時間別予報（今後12時間）
- 週間予報（7日分）
- おすすめ服装（気温・天候・風速・寒暖差を考慮した提案）

## 前提条件

- Python 3.x（標準ライブラリのみ使用、追加パッケージ不要）
- インターネット接続

## 実行方法

```bash
# 東京の天気（デフォルト）
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/weather/weather.py

# 都市名を指定
run_python ~/.claude/skills/weather/weather.py 大阪
run_python ~/.claude/skills/weather/weather.py 札幌
```

## 対応都市

東京、大阪、名古屋、福岡、札幌、横浜、京都、神戸、仙台、広島、那覇

英語名（tokyo, osaka等）でも指定可能。

## 出力例

```
==================================================
  東京の天気 (2026/02/25 08:10)
==================================================

  【現在の天気】
  天気: 🌧 雨
  気温: 10.4℃ (体感: 2℃)
  湿度: 93%
  ...

  【おすすめ服装】
  - コート必須。セーター＋厚手アウター
  - マフラーや手袋があると快適
  - 傘を忘れずに！足元は撥水性のある靴がおすすめ
```

## データソース

ウェザーニュース (weathernews.jp) JSON API

## 旧バージョン（wttr.in）

以前はwttr.in APIを使用していましたが、サービスの安定性の問題からウェザーニュースAPIに移行しました。
wttr.inを直接使いたい場合は以下のコマンドで利用可能です:

```bash
curl -s "wttr.in/Tokyo?lang=ja"
curl -s "wttr.in/Tokyo?format=%l:+%c+%t+%h+%w&lang=ja"
```
