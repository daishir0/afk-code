---
name: trello
description: Trello REST APIを使ったボード・リスト・カードの操作
---

# Trello API

Trello REST APIを使用して、ボード、リスト、カードの読み取り・作成・更新・削除を行うスキルです。

## 前提条件

- `env.yaml` に `trello_key` と `trello_token` を設定済みであること
- `requests` パッケージがインストール済みであること

### env.yaml設定例

```yaml
trello_key: YOUR_TRELLO_API_KEY
trello_token: YOUR_TRELLO_TOKEN
```

### APIキーとトークンの取得

1. https://trello.com/power-ups/admin にアクセス
2. 「New」をクリックしてPower-Upを作成（または既存のものを使用）
3. 「API Key」を取得 → `trello_key` に設定
4. APIキーページの「Token」リンクをクリックしてトークンを生成 → `trello_token` に設定

### パッケージインストール

```bash
source ~/.claude/lib/load_env.sh
run_python -m pip install requests
```

## 使い方

### ボード操作

```bash
# 自分のボード一覧を取得
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py list-boards

# ボードの詳細を取得
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py get-board "BOARD_ID"
```

### リスト操作

```bash
# ボード内のリスト一覧を取得
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py list-lists "BOARD_ID"

# リストを作成
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py create-list "BOARD_ID" "リスト名"
```

### カード操作

```bash
# リスト内のカード一覧を取得
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py list-cards "LIST_ID"

# カードを作成
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py create-card "LIST_ID" "カードタイトル" "説明文"

# カードを更新
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py update-card "CARD_ID" --name "新タイトル" --desc "新説明"

# カードを別リストに移動
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py move-card "CARD_ID" "TARGET_LIST_ID"

# カードにコメントを追加
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py add-comment "CARD_ID" "コメント内容"

# カードを削除
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py delete-card "CARD_ID"
```

### 結果をファイルに保存

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/trello/script.py list-boards --output boards.json
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| list-boards | 自分のボード一覧を取得 |
| get-board | ボードの詳細を取得 |
| list-lists | ボード内のリスト一覧を取得 |
| create-list | リストを作成 |
| list-cards | リスト内のカード一覧を取得 |
| create-card | カードを作成 |
| update-card | カードを更新 |
| move-card | カードを別リストに移動 |
| add-comment | カードにコメントを追加 |
| delete-card | カードを削除 |

## 出力

- 結果は標準出力に表示されます
- `--output` を指定した場合は `./outputs/` ディレクトリにも保存されます
