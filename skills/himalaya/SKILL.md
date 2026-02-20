---
name: himalaya
description: ユーザーが「メール確認して」「メール一覧」「メール送信」「メールに返信」「メール検索」などと指示した時に使用。himalaya CLIを使用したメール管理スキル（IMAP/SMTP対応）
---

# Himalaya - メール管理CLI

himalaya CLIを使用して、メールの一覧表示・閲覧・送信・返信・削除を行います。
IMAP/SMTPプロトコルに対応し、Gmail、Outlook、独自メールサーバー等で利用可能です。

## 前提条件

- himalaya CLI がインストールされていること
- himalaya の設定ファイルが構成済みであること

### インストール方法

```bash
# macOS (Homebrew)
brew install himalaya

# Linux (Cargo)
cargo install himalaya

# その他の方法
# https://github.com/pimalaya/himalaya を参照
```

### 設定ファイル

himalayaの設定ファイルは `~/.config/himalaya/config.toml` に配置します。

```toml
[accounts.default]
email = "your-email@example.com"
display-name = "Your Name"
downloads-dir = "~/Downloads"

# IMAP設定
[accounts.default.imap]
host = "imap.gmail.com"
port = 993
login = "your-email@example.com"
# アプリパスワードを使用（Gmailの場合）
passwd.cmd = "op item get 'Gmail' --fields label=password --reveal"

# SMTP設定
[accounts.default.smtp]
host = "smtp.gmail.com"
port = 465
login = "your-email@example.com"
passwd.cmd = "op item get 'Gmail' --fields label=password --reveal"
```

**Gmail使用時の注意**: Googleアカウントの「アプリパスワード」を生成して使用すること。

## トリガーとなるフレーズ

- "メールを確認して" / "メール一覧"
- "メールを読んで" / "メールの内容を見せて"
- "メールを送って" / "メール送信"
- "メールに返信して"
- "メールを検索して"
- "メールを削除して"
- "未読メールを確認"

## 操作一覧

### 1. メール一覧の表示

```bash
# デフォルトフォルダ（INBOX）の一覧
himalaya list

# 件数を指定
himalaya list --page-size 20

# 特定フォルダの一覧
himalaya list --folder "INBOX"
himalaya list --folder "Sent"
himalaya list --folder "Drafts"
himalaya list --folder "Trash"

# テーブル形式で表示（デフォルト）
himalaya list --output table

# JSON形式で出力
himalaya list --output json
```

### 2. メールの閲覧

```bash
# IDを指定してメールを読む
himalaya read <MESSAGE_ID>

# プレーンテキストで読む
himalaya read <MESSAGE_ID> --text-mime plain

# HTML形式で読む
himalaya read <MESSAGE_ID> --text-mime html

# ヘッダー情報を含めて表示
himalaya read <MESSAGE_ID> --headers "From,To,Subject,Date"
```

### 3. メールの検索

```bash
# 件名で検索
himalaya search "subject:検索キーワード"

# 送信者で検索
himalaya search "from:sender@example.com"

# 本文で検索
himalaya search "body:キーワード"

# 日付範囲で検索
himalaya search "since:2026-01-01 before:2026-02-01"

# 複合条件
himalaya search "from:example.com subject:重要"

# 未読メールのみ
himalaya search "unseen"
```

### 4. メールの送信

```bash
# インタラクティブに送信（テンプレートを生成してエディタで編集）
himalaya write

# テンプレートを使って送信（非インタラクティブ）
himalaya send <<'EOF'
From: your-email@example.com
To: recipient@example.com
Subject: メールの件名

本文をここに記載します。
よろしくお願いいたします。
EOF
```

ファイル経由で送信（推奨 - 特殊文字対策）:

```bash
# 1. Writeツールで ./outputs/email_draft.txt にメール内容を書き出す
# 2. himalayaで送信
himalaya send < ./outputs/email_draft.txt && rm ./outputs/email_draft.txt
```

メール内容ファイルのフォーマット:
```
From: your-email@example.com
To: recipient@example.com
Subject: 件名

本文
```

### 5. メールへの返信

```bash
# 返信（テンプレートを生成）
himalaya reply <MESSAGE_ID>

# 全員に返信
himalaya reply --all <MESSAGE_ID>

# 非インタラクティブで返信
himalaya reply <MESSAGE_ID> <<'EOF'
返信本文をここに記載します。
EOF
```

### 6. メールの転送

```bash
# 転送テンプレートを生成
himalaya forward <MESSAGE_ID>
```

### 7. メールの削除・移動

```bash
# メールを削除（ゴミ箱に移動）
himalaya delete <MESSAGE_ID>

# メールを移動
himalaya move <MESSAGE_ID> --to "Archive"

# フラグ操作（既読/未読）
himalaya flag add <MESSAGE_ID> seen    # 既読にする
himalaya flag remove <MESSAGE_ID> seen  # 未読にする
```

### 8. 添付ファイルの操作

```bash
# 添付ファイルをダウンロード
himalaya attachment download <MESSAGE_ID>

# ダウンロード先を指定
himalaya attachment download <MESSAGE_ID> --dir ./outputs
```

### 9. フォルダ管理

```bash
# フォルダ一覧
himalaya folder list

# フォルダ作成
himalaya folder create "新しいフォルダ"

# フォルダ削除
himalaya folder delete "フォルダ名"
```

### 10. 複数アカウント対応

```bash
# 特定のアカウントを指定して操作
himalaya --account work list
himalaya --account personal list
```

## 使用例

### ケース1: 未読メール確認
```
ユーザー: "未読メールを確認して"
Claude:
  himalaya search "unseen"
  → 未読メール一覧を表示
```

### ケース2: メール送信
```
ユーザー: "田中さんにミーティングの日程調整メールを送って"
Claude:
  1. Writeツールで ./outputs/email_draft.txt にメール内容を書き出す
  2. himalaya send < ./outputs/email_draft.txt && rm ./outputs/email_draft.txt
```

### ケース3: メール検索
```
ユーザー: "先月の請求書関連のメールを探して"
Claude:
  himalaya search "subject:請求書 since:2026-01-01 before:2026-02-01"
```

### ケース4: メールの内容確認
```
ユーザー: "最新のメールを読んで"
Claude:
  1. himalaya list --page-size 1 で最新を取得
  2. himalaya read <ID> で内容表示
```

### ケース5: 返信
```
ユーザー: "このメールに返信して"
Claude:
  1. Writeツールで返信内容を ./outputs/email_reply.txt に書き出す
  2. himalaya reply <ID> < ./outputs/email_reply.txt && rm ./outputs/email_reply.txt
```

## 注意事項

- メール送信前にユーザーに内容を確認してもらうこと
- パスワードは1Password CLI連携やkeychain連携で安全に管理すること
- 大量のメールを一括操作する場合は事前に確認を取ること
- IMAPサーバーの接続制限に注意（短時間に大量のリクエストを送らない）
- Gmailの場合、「安全性の低いアプリのアクセス」ではなく「アプリパスワード」を使用すること
- himalayaの設定ファイルにパスワードを直接記載しないこと（コマンド経由推奨）
