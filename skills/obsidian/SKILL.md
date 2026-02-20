---
name: obsidian
description: Obsidianボールトのファイル操作（直接ファイルアクセスまたはREST API経由）
---

# Obsidian ボールト操作

Obsidianのボールト（vault）内のノートを読み取り・作成・更新・検索するスキルです。
2つの方式をサポートしています:

1. **直接ファイルアクセス**: ボールトのディレクトリに対して直接ファイル操作（推奨）
2. **REST API**: Obsidian Local REST APIプラグイン経由

## 方式1: 直接ファイルアクセス（推奨）

### 前提条件

- Obsidianのボールトパスが既知であること

### env.yaml設定例

```yaml
obsidian_vault_path: ~/Documents/MyVault
```

### ノートの読み取り

```bash
# ノートの内容を読む
cat ~/Documents/MyVault/Notes/my-note.md

# Readツールを使用してノートを読む（Claude Code内）
# → ファイルパスを直接指定
```

### ノートの作成

Writeツールを使用して、ボールトディレクトリ内にMarkdownファイルを作成します。

```markdown
---
title: ノートタイトル
date: 2026-02-20
tags: [tag1, tag2]
---

# ノートタイトル

ノートの本文...
```

### ノートの検索

```bash
# ファイル名で検索
find ~/Documents/MyVault -name "*.md" -iname "*keyword*"

# 内容で検索
grep -r "keyword" ~/Documents/MyVault --include="*.md" -l

# タグで検索
grep -r "tags:.*keyword" ~/Documents/MyVault --include="*.md" -l
```

### ノートの更新

Editツールを使用して、既存のMarkdownファイルを編集します。

### ディレクトリ構造の確認

```bash
# ボールトのフォルダ構造を表示
ls -la ~/Documents/MyVault/
ls -R ~/Documents/MyVault/ | head -50
```

### デイリーノート

Obsidianのデイリーノートは通常以下のパスにあります:

```bash
# 一般的なデイリーノートのパス
~/Documents/MyVault/Daily Notes/2026-02-20.md

# または
~/Documents/MyVault/Journal/2026-02-20.md
```

### テンプレートの活用

新規ノート作成時にテンプレートを適用する場合:

```bash
# テンプレートディレクトリの確認
ls ~/Documents/MyVault/Templates/

# テンプレートを読み込んで新規ノートに適用
# → Readツールでテンプレートを読み → Writeツールで新規ファイル作成
```

---

## 方式2: Obsidian Local REST API

### 前提条件

- Obsidianが起動していること
- 「Local REST API」プラグインがインストール・有効化されていること
- プラグインでAPIキーが設定されていること

### プラグインのインストール

1. Obsidian設定 → コミュニティプラグイン → 「Local REST API」を検索
2. インストール → 有効化
3. プラグイン設定でAPI Keyを設定

### env.yaml設定例

```yaml
obsidian_api_url: https://127.0.0.1:27124
obsidian_api_key: YOUR_API_KEY
obsidian_vault_path: ~/Documents/MyVault
```

### API経由の操作

```bash
# ノートの取得
curl -k -H "Authorization: Bearer YOUR_API_KEY" \
  "https://127.0.0.1:27124/vault/Notes/my-note.md"

# ノートの作成
curl -k -X PUT \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: text/markdown" \
  -d "# New Note\n\nContent here" \
  "https://127.0.0.1:27124/vault/Notes/new-note.md"

# ノートの更新（追記）
curl -k -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: text/markdown" \
  -d "\n\n## Added Section\n\nAppended content" \
  "https://127.0.0.1:27124/vault/Notes/existing-note.md"

# ノートの検索
curl -k -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "search keyword"}' \
  "https://127.0.0.1:27124/search/simple/"

# ボールト内のファイル一覧
curl -k -H "Authorization: Bearer YOUR_API_KEY" \
  "https://127.0.0.1:27124/vault/"
```

### API エンドポイント一覧

| メソッド | エンドポイント | 説明 |
|---------|-------------|------|
| GET | /vault/{path} | ノートの取得 |
| PUT | /vault/{path} | ノートの作成/上書き |
| POST | /vault/{path} | ノートへの追記 |
| PATCH | /vault/{path} | ノートの部分更新 |
| DELETE | /vault/{path} | ノートの削除 |
| GET | /vault/ | ファイル一覧 |
| POST | /search/simple/ | シンプル検索 |
| POST | /commands/{commandId}/ | コマンド実行 |
| GET | /active/ | アクティブファイル取得 |

---

## ベストプラクティス

### Obsidian形式のリンク

```markdown
# 内部リンク
[[別のノート]]
[[フォルダ/ノート名]]
[[ノート名#見出し]]
[[ノート名|表示テキスト]]

# タグ
#tag1 #tag2/subtag

# 埋め込み
![[画像ファイル.png]]
![[別のノート]]
```

### フロントマター（YAML）

```yaml
---
title: ノートタイトル
date: 2026-02-20
tags: [project, important]
aliases: [別名1, 別名2]
cssclass: custom-class
---
```

### フォルダ構成の推奨パターン

```
MyVault/
├── Inbox/          # 新規メモの一時保管
├── Notes/          # 整理済みノート
├── Projects/       # プロジェクト別
├── Daily Notes/    # デイリーノート
├── Templates/      # テンプレート
├── Attachments/    # 画像・添付ファイル
└── Archive/        # アーカイブ
```

## トラブルシューティング

- **ボールトが見つからない**: `obsidian_vault_path` が正しく設定されているか確認。
- **REST APIに接続できない**: Obsidianが起動しているか確認。Local REST APIプラグインが有効か確認。
- **SSL証明書エラー**: REST APIはself-signed certificateを使用するため、`curl -k` または `verify=False` が必要。
- **日本語ファイル名**: UTF-8エンコーディングが使用されていることを確認。
