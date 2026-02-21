---
name: himalaya
description: ユーザーが「メール確認して」「メール一覧」「メール送信」「メールに返信」「メール検索」などと指示した時に使用。himalaya CLIを使用したメール管理スキル（IMAP/SMTP対応）
---

# Himalaya - メール管理CLI (v1.2.0)

himalaya CLIを使用して、メールの一覧表示・閲覧・送信・返信・削除を行います。
IMAP/SMTPプロトコルに対応し、Gmail、Outlook、独自メールサーバー等で利用可能です。

## 前提条件

- himalaya CLI v1.2.0 以上がインストールされていること
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

**v1.2.0 の設定形式（フラットドット記法）:**

```toml
[accounts.default]
default = true
email = "your-email@example.com"
display-name = "Your Name"
downloads-dir = "~/Downloads"

backend.type = "imap"
backend.host = "imap.gmail.com"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "your-email@example.com"
backend.auth.type = "password"
backend.auth.cmd = "security find-generic-password -a 'your-email@example.com' -s 'himalaya-gmail' -w"

message.send.backend.type = "smtp"
message.send.backend.host = "smtp.gmail.com"
message.send.backend.port = 465
message.send.backend.encryption.type = "tls"
message.send.backend.login = "your-email@example.com"
message.send.backend.auth.type = "password"
message.send.backend.auth.cmd = "security find-generic-password -a 'your-email@example.com' -s 'himalaya-gmail' -w"
```

**Gmail使用時の注意**: Googleアカウントの「アプリパスワード」を生成して使用すること。macOS Keychainにパスワードを保存し、`security` コマンドで取得する方式を推奨。

## トリガーとなるフレーズ

- "メールを確認して" / "メール一覧"
- "メールを読んで" / "メールの内容を見せて"
- "メールを送って" / "メール送信"
- "メールに返信して"
- "メールを検索して"
- "メールを削除して"
- "未読メールを確認"

## 操作一覧

### 1. メール一覧（envelope list）

```bash
# デフォルトフォルダ（INBOX）の一覧
himalaya envelope list

# 件数を指定
himalaya envelope list --page-size 20

# 特定フォルダの一覧
himalaya envelope list --folder "INBOX"
himalaya envelope list --folder "[Gmail]/Sent Mail"
himalaya envelope list --folder "[Gmail]/Drafts"
himalaya envelope list --folder "[Gmail]/Trash"

# JSON形式で出力
himalaya envelope list --output json
```

### 2. メールの検索（envelope list + クエリ）

v1.2.0 では `envelope list` にクエリを付加して検索します。

```bash
# 件名で検索
himalaya envelope list subject "検索キーワード"

# 送信者で検索
himalaya envelope list from "sender@example.com"

# 本文で検索
himalaya envelope list body "キーワード"

# 日付フィルタ
himalaya envelope list after 2026-01-01 before 2026-02-01

# 未読メールのみ
himalaya envelope list not flag seen

# 複合条件
himalaya envelope list from "example.com" and subject "重要"

# ソート（日付降順）
himalaya envelope list order by date desc

# フィルタ + ソート
himalaya envelope list subject "請求書" order by date desc
```

### 3. メールの閲覧（message read）

```bash
# IDを指定してメールを読む
himalaya message read <ENVELOPE_ID>

# 複数のメールを読む
himalaya message read <ID1> <ID2>

# スレッド表示
himalaya message thread <ENVELOPE_ID>
```

### 4. メールの送信（template send）

テンプレート形式でメールを送信します。ファイル経由が推奨です。

```bash
# 1. Writeツールで ./outputs/email_draft.txt にメール内容を書き出す
# 2. template send で送信
himalaya template send < ./outputs/email_draft.txt && rm ./outputs/email_draft.txt
```

メール内容ファイルのフォーマット（MMLテンプレート）:
```
From: your-email@example.com
To: recipient@example.com
Subject: 件名

本文をここに記載します。
よろしくお願いいたします。
```

ヒアドキュメントで直接送信:
```bash
himalaya template send <<'EOF'
From: your-email@example.com
To: recipient@example.com
Subject: メールの件名

本文をここに記載します。
EOF
```

### 5. メールへの返信（message reply / template reply + send）

```bash
# 返信テンプレートを生成（確認用）
himalaya template reply <ENVELOPE_ID>

# 返信テンプレートを生成して送信
himalaya template reply <ENVELOPE_ID> | himalaya template send

# ファイル経由で返信（推奨）
# 1. template reply でテンプレートを取得
himalaya template reply <ENVELOPE_ID> > ./outputs/email_reply.txt
# 2. Editツールで返信本文を編集
# 3. 送信
himalaya template send < ./outputs/email_reply.txt && rm ./outputs/email_reply.txt
```

### 6. メールの転送（template forward + send）

```bash
# 転送テンプレートを生成
himalaya template forward <ENVELOPE_ID>

# 転送テンプレートを取得して編集・送信
himalaya template forward <ENVELOPE_ID> > ./outputs/email_forward.txt
# Editツールで宛先・本文を編集
himalaya template send < ./outputs/email_forward.txt && rm ./outputs/email_forward.txt
```

### 7. メールの削除・移動

```bash
# メールを削除
himalaya message delete <ENVELOPE_ID>

# メールを移動
himalaya message move <ENVELOPE_ID> --folder INBOX "[Gmail]/Trash"

# メールをコピー
himalaya message copy <ENVELOPE_ID> --folder INBOX "Archive"
```

### 8. フラグ操作（既読/未読）

```bash
# 既読にする
himalaya flag add <ENVELOPE_ID> seen

# 未読にする
himalaya flag remove <ENVELOPE_ID> seen

# フラグを追加
himalaya flag add <ENVELOPE_ID> flagged
```

### 9. 添付ファイルのダウンロード

```bash
# 添付ファイルをダウンロード（downloads-dirに保存）
himalaya attachment download <ENVELOPE_ID>
```

### 10. フォルダ管理

```bash
# フォルダ一覧
himalaya folder list

# フォルダ作成
himalaya folder add "新しいフォルダ"

# フォルダ削除
himalaya folder delete "フォルダ名"

# フォルダ内を空にする（メールを完全削除）
himalaya folder purge "フォルダ名"
```

### 11. 複数アカウント対応

```bash
# 特定のアカウントを指定して操作
himalaya --account work envelope list
himalaya --account personal envelope list
```

## 使用例

### ケース1: 未読メール確認
```
ユーザー: "未読メールを確認して"
Claude:
  himalaya envelope list not flag seen
  → 未読メール一覧を表示
```

### ケース2: メール送信
```
ユーザー: "田中さんにミーティングの日程調整メールを送って"
Claude:
  1. Writeツールで ./outputs/email_draft.txt にメール内容を書き出す
  2. himalaya template send < ./outputs/email_draft.txt && rm ./outputs/email_draft.txt
```

### ケース3: メール検索
```
ユーザー: "先月の請求書関連のメールを探して"
Claude:
  himalaya envelope list subject "請求書" after 2026-01-01 before 2026-02-01
```

### ケース4: メールの内容確認
```
ユーザー: "最新のメールを読んで"
Claude:
  1. himalaya envelope list --page-size 1 で最新を取得
  2. himalaya message read <ID> で内容表示
```

### ケース5: 返信
```
ユーザー: "このメールに返信して"
Claude:
  1. himalaya template reply <ID> > ./outputs/email_reply.txt
  2. Editツールで返信本文を追加
  3. himalaya template send < ./outputs/email_reply.txt && rm ./outputs/email_reply.txt
```

## 注意事項

- メール送信前にユーザーに内容を確認してもらうこと
- パスワードはmacOS Keychainや1Password CLI等で安全に管理すること
- 大量のメールを一括操作する場合は事前に確認を取ること
- IMAPサーバーの接続制限に注意（短時間に大量のリクエストを送らない）
- Gmailの場合、「アプリパスワード」を使用すること
- himalayaの設定ファイルにパスワードを直接記載しないこと（コマンド経由推奨）
- v1.2.0 では旧コマンド（`himalaya list`, `himalaya read`, `himalaya search` 等）は使用不可。必ず `envelope list`, `message read` 等のサブコマンド形式を使うこと
