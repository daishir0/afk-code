---
name: food-order
description: ユーザーが「ご飯を注文して」「出前頼みたい」「UberEatsで注文」「デリバリーしたい」「何か食べたい」などと指示した時に使用。フードデリバリーサービスの注文ガイダンスとブラウザ自動化による注文支援スキル
---

# Food Order - フードデリバリー注文ガイド

フードデリバリーサービス（Uber Eats, 出前館, DoorDash 等）への注文をガイド・支援します。
各サービスへのリンク提供、メニュー検索、ブラウザ自動化による注文支援を行います。

## トリガーとなるフレーズ

- "ご飯を注文して" / "出前頼みたい"
- "Uber Eatsで注文" / "出前館で注文"
- "デリバリーしたい"
- "何か食べたい" / "お腹すいた"
- "ピザを頼みたい" / "寿司をデリバリー"
- "近くのレストランを探して"

## 対応サービス

### 日本

| サービス | URL | 特徴 |
|---------|-----|------|
| Uber Eats | https://www.ubereats.com/jp | 豊富な店舗数、プロモーション多数 |
| 出前館 | https://demae-can.com | 日本最大級のデリバリーサービス |
| menu | https://menu.inc | 日本発のデリバリーサービス |
| Wolt | https://wolt.com/ja/jpn | 北欧発、こだわりの店舗が多い |
| ピザーラ | https://www.pizza-la.co.jp | ピザ専門 |
| ドミノ・ピザ | https://www.dominos.jp | ピザ専門、お得なクーポン多数 |
| 銀のさら | https://www.ginsara.jp | 宅配寿司専門 |
| ガスト宅配 | https://www.skylark.co.jp/gusto/delivery/ | ファミレスメニューのデリバリー |

### 海外（グローバル）

| サービス | URL | 対応地域 |
|---------|-----|---------|
| Uber Eats | https://www.ubereats.com | グローバル |
| DoorDash | https://www.doordash.com | 米国、カナダ、豪州 |
| Grubhub | https://www.grubhub.com | 米国 |
| Deliveroo | https://deliveroo.com | 英国、欧州 |
| Just Eat | https://www.just-eat.com | 欧州 |
| Foodpanda | https://www.foodpanda.com | アジア |

## 注文フロー

### ステップ1: ユーザーのニーズをヒアリング

以下を確認します:
- **何を食べたいか**: ジャンル（ピザ、寿司、中華、etc.）または具体的なメニュー
- **予算**: 1人あたりの予算目安
- **人数**: 何人分の注文か
- **配達先**: 住所（ブラウザ自動化で使用）
- **使用サービス**: 好みのサービスがあるか

### ステップ2: サービス選択とリンク提供

ヒアリング内容に基づいて、最適なサービスのリンクを提供します。

```
例: "ピザが食べたい"
→ 以下のリンクを提案:
  - Uber Eats ピザカテゴリ: https://www.ubereats.com/jp/category/pizza
  - ピザーラ: https://www.pizza-la.co.jp
  - ドミノ・ピザ: https://www.dominos.jp
```

### ステップ3: ブラウザ自動化で注文支援（オプション）

browser-automationスキルと連携して、ブラウザでの注文操作を支援できます。

```bash
# ブラウザでUber Eatsを開く
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/browser-automation/open_url.py "https://www.ubereats.com/jp"
```

## 使用方法

### 方法1: リンク案内（基本）

ユーザーの要望を聞いて、適切なサービスのURLを案内します。

```
ユーザー: "お寿司を注文したい"
Claude:
  お寿司のデリバリーですね！以下のサービスがおすすめです:

  1. 銀のさら（宅配寿司専門）: https://www.ginsara.jp
  2. Uber Eats（寿司カテゴリ）: https://www.ubereats.com/jp/category/sushi
  3. 出前館（寿司で検索）: https://demae-can.com

  ブラウザで開きましょうか？
```

### 方法2: ブラウザで直接開く

```bash
# macOS - デフォルトブラウザで開く
open "https://www.ubereats.com/jp"

# Linux
xdg-open "https://www.ubereats.com/jp"
```

### 方法3: ブラウザ自動化（browser-automationスキル連携）

Seleniumを使用して、メニュー検索や注文フォームの入力を支援できます。

```bash
# browser-automationスキルでページを開いてスクリーンショットを取得
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/browser-automation/screenshot.py "https://www.ubereats.com/jp/search?q=ピザ"
```

## ジャンル別おすすめサービス

### ピザ
- ドミノ・ピザ（クーポンが多い、持ち帰り半額）
- ピザーラ（品質重視）
- ピザハット（バラエティ豊富）

### 寿司
- 銀のさら（専門店の品質）
- Uber Eats / 出前館（近くの寿司店を検索）

### 中華
- Uber Eats / 出前館（店舗数が多い）

### ファストフード
- Uber Eats（マクドナルド、モスバーガー等の公式デリバリー）
- 出前館

### 弁当・定食
- Uber Eats / Wolt（個人店が多い）

## 使用例

### ケース1: 漠然としたリクエスト
```
ユーザー: "お腹すいた、何か頼みたい"
Claude:
  何が食べたい気分ですか？以下からお選びください:
  - ピザ / パスタ（イタリアン）
  - 寿司 / 和食
  - 中華
  - ハンバーガー / ファストフード
  - カレー
  - 韓国料理
  また、予算や人数も教えてください！
```

### ケース2: 具体的なリクエスト
```
ユーザー: "ドミノ・ピザでマルゲリータのLサイズを注文したい"
Claude:
  ドミノ・ピザの注文ページを開きます:
  → open "https://www.dominos.jp"

  マルゲリータLサイズですね。
  現在のクーポン情報も確認しましょうか？
```

### ケース3: 比較検討
```
ユーザー: "2000円以内でピザを頼みたい。一番お得なのは？"
Claude:
  2000円以内のピザデリバリーを比較します:

  1. ドミノ・ピザ: 持ち帰り半額キャンペーンが常時あり
     → https://www.dominos.jp
  2. ピザーラ: セットメニューがお得
     → https://www.pizza-la.co.jp
  3. Uber Eats: 初回注文割引あり（時期による）
     → https://www.ubereats.com/jp

  ブラウザで詳細を確認しますか？
```

## 注意事項

- 実際の注文確定（決済）はユーザー自身が行うこと
- 価格やクーポン情報は変動するため、最新情報はサービスサイトで確認すること
- 配達可能エリアはサービスや店舗によって異なる
- 深夜・早朝は注文できない場合がある
- アレルギー情報は必ずサービスサイトで直接確認すること
- 個人情報（住所、電話番号、クレジットカード情報）はファイルに保存しないこと
