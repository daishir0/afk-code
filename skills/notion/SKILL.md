---
name: notion
description: Notion APIを使ったページの読み取り・作成・更新・検索操作
---

# Notion API

Notion APIを使用して、ページの読み取り、作成、更新、検索を行うスキルです。

## 前提条件

- `env.yaml` に `notion_token` を設定済みであること
- `requests` パッケージがインストール済みであること
- Notion Integrationが作成済みで、対象ページ/データベースへのアクセス権が付与されていること

### env.yaml設定例

```yaml
notion_token: ntn_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Notion Integrationの設定

1. https://www.notion.so/my-integrations にアクセス
2. 「New integration」をクリック
3. 名前を設定してSubmit
4. Internal Integration Secretを `env.yaml` の `notion_token` に設定
5. 対象のNotionページ/データベースで「Connect to」からIntegrationを追加

### パッケージインストール

```bash
source ~/.claude/lib/load_env.sh
run_python -m pip install requests
```

## 使い方

### ページの読み取り

```bash
# ページIDを指定して内容を取得
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py get-page "PAGE_ID"

# ページのブロック（子要素）を取得
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py get-blocks "PAGE_ID"
```

### 検索

```bash
# キーワードで検索
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py search "検索キーワード"

# ページのみ検索
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py search "検索キーワード" --filter page

# データベースのみ検索
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py search "検索キーワード" --filter database
```

### ページの作成

```bash
# 親ページ配下に新規ページを作成
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py create-page "PARENT_PAGE_ID" "ページタイトル" "ページ本文テキスト"

# データベースにアイテムを追加
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py create-db-item "DATABASE_ID" "アイテムタイトル" "本文テキスト"
```

### ページの更新

```bash
# ページにテキストブロックを追加
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py append-block "PAGE_ID" "追加するテキスト"

# ページタイトルを更新
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py update-title "PAGE_ID" "新しいタイトル"
```

### データベースのクエリ

```bash
# データベースの全アイテムを取得
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py query-db "DATABASE_ID"
```

### 結果をファイルに保存

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/notion/script.py get-page "PAGE_ID" --output page_content.txt
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| get-page | ページのプロパティを取得 |
| get-blocks | ページのブロック内容を取得 |
| search | ワークスペース内を検索 |
| create-page | 新規ページを作成 |
| create-db-item | データベースにアイテムを追加 |
| append-block | ページにブロックを追加 |
| update-title | ページタイトルを更新 |
| query-db | データベースをクエリ |

## ページIDの取得方法

NotionのページURLから取得できます:
- URL: `https://www.notion.so/workspace/Page-Title-abc123def456`
- ページID: `abc123def456`（末尾の32文字のハイフンなしUUID）
- またはハイフン付き形式: `abc123de-f456-...`

## 出力

- 結果は標準出力にJSON形式で表示されます
- `--output` を指定した場合は `./outputs/` ディレクトリにも保存されます
