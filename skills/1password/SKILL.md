---
name: 1password
description: ユーザーが「パスワードを取得」「1Passwordで検索」「ログイン情報を確認」「パスワードを保存」などと指示した時に使用。1Password CLIを使用したパスワード・シークレット管理スキル
---

# 1Password CLI

1Password CLI (`op`) を使用して、パスワードやシークレットの取得・作成・検索を行います。

## 前提条件

- 1Password CLI (`op`) がインストールされていること
- 1Password CLIで認証済みであること（`op signin` 完了済み）
- 1Passwordデスクトップアプリとの連携（biometric unlock）が推奨

### インストール方法

```bash
# macOS (Homebrew)
brew install --cask 1password-cli

# Linux
# https://developer.1password.com/docs/cli/get-started/ を参照

# Windows (winget)
# winget install AgileBits.1Password.CLI
```

### 初回認証

```bash
# サインイン（ブラウザベース認証 - 推奨）
op signin

# または、デスクトップアプリ連携を有効化
# 1Passwordアプリ → 設定 → 開発者 → 「CLIとの連携」を有効化
```

## トリガーとなるフレーズ

- "パスワードを取得して" / "パスワード教えて"
- "1Passwordで〇〇を検索"
- "ログイン情報を確認"
- "パスワードを保存して"
- "新しいログイン情報を登録"
- "シークレットを取得"
- "APIキーを確認"

## 操作一覧

### 1. アイテムの検索

```bash
# タイトルで検索
op item list --tags "" | grep -i "検索キーワード"

# カテゴリを指定して検索
op item list --categories Login
op item list --categories "Secure Note"
op item list --categories "API Credential"

# Vault を指定して検索
op item list --vault "Personal"
op item list --vault "Work"

# 全アイテム一覧（JSON形式）
op item list --format json
```

### 2. アイテムの詳細取得

```bash
# タイトルで取得
op item get "アイテム名"

# IDで取得
op item get "ITEM_ID"

# 特定フィールドのみ取得
op item get "アイテム名" --fields label=username
op item get "アイテム名" --fields label=password

# パスワードのみ取得（スクリプト連携向け）
op item get "アイテム名" --fields label=password --reveal

# JSON形式で全フィールド取得
op item get "アイテム名" --format json
```

### 3. ワンタイムパスワード（TOTP）の取得

```bash
# TOTPコード取得
op item get "アイテム名" --otp
```

### 4. アイテムの作成

```bash
# ログインアイテムの作成
op item create --category Login \
  --title "サービス名" \
  --url "https://example.com" \
  --vault "Personal" \
  --generate-password='letters,digits,symbols,32' \
  username="user@example.com"

# セキュアノートの作成
op item create --category "Secure Note" \
  --title "メモタイトル" \
  --vault "Personal" \
  notesPlain="ここにメモの内容を記載"

# API Credentialの作成
op item create --category "API Credential" \
  --title "API名" \
  --vault "Work" \
  credential="YOUR_API_KEY"
```

### 5. アイテムの編集

```bash
# フィールドの更新
op item edit "アイテム名" password="新しいパスワード"
op item edit "アイテム名" username="新しいユーザー名"

# ノートの更新
op item edit "アイテム名" notesPlain="更新されたメモ"
```

### 6. アイテムの削除

```bash
# アーカイブ（復元可能）
op item delete "アイテム名" --archive

# 完全削除
op item delete "アイテム名"
```

### 7. Vault（保管庫）の管理

```bash
# Vault一覧
op vault list

# Vault内のアイテム一覧
op item list --vault "Personal"
```

### 8. シークレットリファレンス（環境変数連携）

```bash
# シークレットリファレンスを使用してenv変数に注入
op run --env-file=.env -- コマンド

# .envファイルの例:
# DATABASE_URL=op://Vault名/アイテム名/フィールド名
# API_KEY=op://Work/MyAPI/credential
```

### 9. パスワード生成

```bash
# ランダムパスワード生成（デフォルト: 32文字）
op item create --category Login --title "テスト" --generate-password

# カスタムパスワード生成
op item create --category Login --title "テスト" \
  --generate-password='letters,digits,symbols,20'

# パスフレーズ生成（記憶しやすい）
op item create --category Login --title "テスト" \
  --generate-password='words,4'
```

## 使用例

### ケース1: ログインパスワードの取得
```
ユーザー: "GitHubのパスワードを教えて"
Claude:
  op item get "GitHub" --fields label=password --reveal
```

### ケース2: 新しいサービスの登録
```
ユーザー: "新しいサービスのログイン情報を1Passwordに保存して"
Claude:
  op item create --category Login --title "サービス名" \
    --url "https://example.com" \
    --generate-password='letters,digits,symbols,24' \
    username="user@example.com"
```

### ケース3: APIキーの取得
```
ユーザー: "AWSのAPIキーを確認して"
Claude:
  op item get "AWS" --format json
```

### ケース4: TOTPの取得
```
ユーザー: "GitHubの二要素認証コードを取得して"
Claude:
  op item get "GitHub" --otp
```

## セキュリティに関する注意事項

- パスワードやシークレットの値を画面に表示する際は、ユーザーに確認を取ること
- `--reveal` フラグを使用するとパスワードが平文で表示される
- 1Password CLIのセッショントークンは一定時間で期限切れになる
- biometric unlock（指紋/顔認証）を有効にすると都度のパスワード入力が不要
- 取得したシークレットをファイルに保存しないこと
- Slack等の外部サービスにパスワードを送信しないこと
