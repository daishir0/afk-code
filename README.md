# AFK Code

Telegram、Slack、Discord から Claude Code セッションをリモート操作し、**自律的に動かす**ためのシステム。  
永続メモリ・Heartbeat 自律行動・Cron スケジューラー・50以上のスキルを内蔵。

> **[English version below](#english-version)**

<img src="https://github.com/user-attachments/assets/83083b63-9ca2-4ef0-b83d-fcc51bd2fff9" alt="AFK Code スクリーンショット" width="420">

---

## 主な機能

| 機能 | 説明 |
|------|------|
| **リモート操作** | Telegram / Slack / Discord から Claude Code を操作 |
| **Heartbeat** | 30 分ごとに Claude が自律的にタスクを確認・実行 |
| **Cron ジョブ** | crontab 式でタスクを定時実行 |
| **永続メモリ** | SOUL.md / MEMORY.md / 日次ノートで長期記憶を維持 |
| **マルチセッション** | 複数プロジェクトを同時起動し、ボットから切り替え |
| **Fork / Rewind** | セッションを複製・過去の会話ターンに巻き戻し |
| **スナップショット分析** | 現在の画面を AI が解析してステータスを判定 |
| **画像対応** | 画像ファイルを自動検出してメッセージアプリに送信 |
| **クラッシュ耐性** | AutoRestart ループで Telegram ボットを自動復旧 |
| **50+ スキル** | 天気・Apple 連携・外部 API・スマートホーム等 |

---

## クイックスタート

### 1. インストール

```bash
npm install -g afk-code
```

Node.js 18 以上が必要です。

### 2. メッセージングクライアントの設定

```bash
# Telegram（推奨 — Heartbeat/Cron フルサポート）
afk-code telegram setup

# または Discord / Slack
afk-code discord setup
afk-code slack setup
```

### 3. メモリ・スキルの初期化

```bash
afk-code init
```

`~/.afk-code/` にパーソナリティ・メモリファイルが作成され、同梱スキルが `~/.claude/skills/` にシンボリックリンクとしてインストールされます。

### 4. 起動

```bash
# ターミナル 1: ボット + Heartbeat + Cron
afk-code telegram

# ターミナル 2: Claude Code セッション
afk-code run --restart -- claude
```

または tmux で一括起動:

```bash
afk    # 下記「tmux ショートカット」参照
```

---

## アーキテクチャ

```
┌──────────────────────────────────────────────────────────────┐
│            User (Telegram / Slack / Discord)                 │
└──────────────────────┬───────────────────────────────────────┘
                       │
           ┌───────────▼────────────┐
           │  Bot (grammY / Bolt /  │
           │  discord.js)           │
           └───────────┬────────────┘
                       │
           ┌───────────▼────────────────────────┐
           │  SessionManager                    │
           │  Unix socket /tmp/afk-code-daemon  │
           │  JSONL file watcher                │
           └───────────┬────────────────────────┘
                       │
           ┌───────────▼────────────┐
           │  afk-code run          │
           │  PTY (node-pty)        │
           │  auto-reconnect (5s)   │
           └───────────┬────────────┘
                       │
           ┌───────────▼────────────┐
           │  Claude Code process   │
           └────────────────────────┘

サイドシステム:
┌──────────────────────────────────────────────────────────────┐
│  Scheduler                                                   │
│  ├── Heartbeat Engine（30 分ごと、quiet hours でスキップ）   │
│  └── Cron Engine（crontab 式、hot reload 対応）              │
├──────────────────────────────────────────────────────────────┤
│  AutoRestart Loop（クラッシュ時に自動再起動）                │
│  File Logger（~/.afk-code/logs/、7 日ローテーション）        │
└──────────────────────────────────────────────────────────────┘
```

1. `afk-code telegram` でボット・Heartbeat・Cron スケジューラーを起動
2. `afk-code run --restart -- claude` で Claude Code を PTY 起動し、Unix socket で接続
3. JSONL ファイル監視でメッセージを双方向にリレー
4. Heartbeat が 30 分ごとにチェックインプロンプトを送信
5. Cron が設定した時刻にタスクプロンプトを送信
6. Claude Code が SOUL.md / HEARTBEAT.md / MEMORY.md を読み込み、文脈を維持

---

## Heartbeat

Heartbeat は Claude を「反応型」から「能動型」に変えるコア機能です。  
30 分ごとに Claude が `~/.afk-code/HEARTBEAT.md` を読み、自律的に判断・行動します。

**設定** (`~/.afk-code/scheduler.yaml`):

```yaml
heartbeat:
  enabled: true
  interval_minutes: 30
  quiet_hours:
    start: 23    # 23:00〜7:00 は静粛
    end: 7
  max_consecutive_skips: 3
  silent_relay: true   # プロンプトをメッセージアプリに中継しない
```

**チェックリストのカスタマイズ** (`~/.afk-code/HEARTBEAT.md`):

```markdown
## 毎回確認
- [ ] 今日の天気
- [ ] Apple Reminders に期限切れタスクがないか
- [ ] 日次ノートの作成/更新

## 条件付き
- [ ] MEMORY.md が 3 日以上更新されていなければキュレーション
```

Telegram コマンド:
- `/heartbeat` — ステータス表示
- `/wakeup` — 手動トリガー

---

## Cron ジョブ

crontab 式でタスクを正確な時刻に実行します。  
設定ファイルの変更は 60 秒以内に自動検出・反映（hot reload）されます。

**設定** (`~/.afk-code/cron.yaml`):

```yaml
jobs:
  - id: morning-briefing
    name: 朝のブリーフィング
    schedule: "0 8 * * *"        # 毎朝 8:00
    prompt: |
      おはようございます。朝のブリーフィング:
      1. 今日の天気
      2. 昨日の重要フォローアップ
      3. 今日のリマインダー確認
    enabled: true
    silent_relay: false          # プロンプトを Telegram に中継する
```

**Cron 式の書き方**:

```
┌──── 分 (0-59)
│ ┌── 時 (0-23)
│ │ ┌ 日 (1-31)
│ │ │ ┌ 月 (1-12)
│ │ │ │ ┌ 曜日 (0-7、0=日曜)
│ │ │ │ │
* * * * *
```

例:
| 式 | 意味 |
|----|------|
| `0 9 * * *` | 毎朝 9:00 |
| `*/30 * * * *` | 30 分ごと |
| `0 9 * * 1-5` | 平日 9:00 |
| `0 19 * * *` | 毎夜 19:00 |

---

## 永続メモリ

```
~/.afk-code/
├── SOUL.md            # AI のパーソナリティ・価値観定義
├── HEARTBEAT.md       # Heartbeat チェックリスト
├── MEMORY.md          # 長期記憶（キュレーション済み）
├── projects.yaml      # 登録プロジェクトディレクトリ
├── scheduler.yaml     # Heartbeat 設定
├── cron.yaml          # Cron ジョブ定義
├── config.yaml        # リレーフィルター設定
├── memory/            # 日次ノート
│   ├── 2026-04-01.md
│   └── 2026-04-02.md
└── logs/              # ファイルログ（7 日保持）
    └── telegram-2026-04-01.log
```

| ファイル | 役割 |
|---------|------|
| `SOUL.md` | AI の「魂」。人格・振る舞い・価値観を定義 |
| `HEARTBEAT.md` | Heartbeat 時のチェックリスト。Claude が読んで行動 |
| `MEMORY.md` | 長期記憶。重要な情報をキュレーション |
| `projects.yaml` | リモートセッション作成用プロジェクトホワイトリスト |
| `scheduler.yaml` | Heartbeat 間隔・quiet hours 等の設定 |
| `cron.yaml` | Cron ジョブ定義（hot reload 対応） |
| `config.yaml` | リレーフィルター（ノイズ抑制） |
| `memory/YYYY-MM-DD.md` | 日次ノート（自動生成） |

---

## 会話ログスクリプト（`scripts/log_conversation.py`）

Claude Code の会話を日次ノートに自動追記するスクリプトです。Heartbeat に組み込むことでセッションをまたいだ会話履歴の記録が可能になります。

**セットアップ（2ステップ）:**

① `~/.claude/env.yaml` に追加:
```yaml
local_timezone_offset: 9   # UTC+N の N（日本: 9）
```

② `~/.claude/lib/load_env.sh` に追加（`OUTPUT_DIR` 設定の直後など）:
```bash
export LOCAL_TIMEZONE_OFFSET=$(get_yaml_value "local_timezone_offset")
[ -z "$LOCAL_TIMEZONE_OFFSET" ] && export LOCAL_TIMEZONE_OFFSET="9"
```

**HEARTBEAT.md への組み込み例:**
```markdown
## 毎回確認
- [ ] 会話ログを日次ノートに追記
  （run_python ~/.afk-code/scripts/log_conversation.py）
```

**仕様:**
- `~/.claude/projects/` 配下の全プロジェクトをスキャン
- 前回記録以降の新着のみ抽出（重複なし）
- JST 日付ごとに `~/.afk-code/memory/YYYY-MM-DD.md` へ追記
- `[HEARTBEAT`・`[CRON:` 等のシステムメッセージは自動フィルタ

> `load_env.sh` は `~/.claude` リポジトリ（afk-code とは別管理）の変更です。`~/.claude` を git 管理している場合は別途コミットしてください。

---

## リレーフィルター

Claude Code が自動注入するシステムメッセージや、チャットに流したくないプロンプトを抑制できます。

**設定** (`~/.afk-code/config.yaml`):

```yaml
relay:
  # user ロールのメッセージがこのプレフィックスで始まる場合はスキップ
  suppress_user_message_prefixes:
    - "<task-notification>"
    - "<local-command-caveat>"
    - "<command-name>"
    - "[CRON: morning-briefing]"   # Cron プロンプトを中継しない例

  # assistant ロール（Claude の返答）がこのプレフィックスで始まる場合はスキップ
  suppress_assistant_message_prefixes:
    - "📰 ニュース:"
    - "[INTERNAL]"
```

---

## マルチセッション

`~/.afk-code/projects.yaml` にプロジェクトを登録し、Telegram からセッションを起動・切り替えできます。

```yaml
# ~/.afk-code/projects.yaml
projects:
  my-app: ~/my-app
  website: ~/website
  research: /workspace/research
```

Telegram から:

```
/switch              → プロジェクト一覧: 🟢 my-app ⭐, ⚪ website
/switch website      → ~/website でセッション起動（起動済みなら切り替え）
```

- 最初に起動したセッションが **プライマリセッション** (⭐) となり、Heartbeat/Cron は常にそこへ送信されます。
- セッションが 1 つだけの場合は自動選択されます。
- 追加セッションも同時実行可能です。

---

## Fork / Rewind

会話履歴を管理する高度なセッション操作機能です。

**Fork** — 現在のセッションを複製して並行作業:

```
/fork   → 現在の JSONL を複製し、新しいセッション (R1, R2...) を起動
```

**Rewind** — 過去の会話ターンに巻き戻し:

```
/rewind        → 会話ターン一覧を表示
/rewind 5      → ターン 5 以降を切り捨てた新セッションを起動
```

---

## スナップショット分析

現在の Claude Code セッション画面を AI が解析し、ステータスを判定します。

```
/snapshot  または  /sn
```

Claude が画面を見て以下を判定・報告:
- `waiting` — ユーザー入力待ち
- `working` — ツール実行中・処理中
- `idle` — 完了・待機
- `error` — エラー発生

インラインキーボードで **Ctrl+C** を送信して割り込むことも可能です。

---

## Permission / Plan Mode 対応

Claude Code が確認を求めたとき、Telegram から直接応答できます。

**Permission プロンプト検出時**:

```
[Claude requested permissions]
1️⃣ Clear ctx + bypass   2️⃣ Bypass perms   3️⃣ Manual approve
```

**Plan Mode 検出時**:

```
[Plan mode: ExitPlanMode detected]
プランファイルの内容が表示される
→ テキストでフィードバック送信可能
```

---

## クラッシュ耐性 / 安定性

長時間稼働のための信頼性機能:

| 機能 | 説明 |
|------|------|
| **AutoRestart ループ** | Telegram ボットがクラッシュすると自動再起動。クイッククラッシュ（<10s）は 45 秒待機（Telegram の 30 秒 long-poll タイムアウト超え）で 409 Conflict を回避 |
| **getUpdates プリコール** | 起動時に古い long-poll 接続をクリアしてから `bot.start()` を呼び出す |
| **Unix socket 自動再接続** | `afk-code run` が daemon との接続を失うと 5 秒ごとに自動再試行 |
| **OOM ガード** | メッセージバッファが 50MB を超えると古いデータを削除 |
| **seenMessages エビクション** | 重複排除キャッシュ上限 50,000 件（超過時に古いものを削除） |
| **File Logger** | `~/.afk-code/logs/telegram-YYYY-MM-DD.log` に全ログを記録（7 日保持）。uncaughtException / unhandledRejection もキャプチャ |

---

## スキル (50+)

`skills/` に同梱。`afk-code init` で `~/.claude/skills/` にシンボリックリンクとしてインストールされます。

### Mac ネイティブ（API キー不要）

| スキル | 説明 |
|--------|------|
| `apple-notes` | Apple Notes 読み書き |
| `apple-reminders` | Apple Reminders 管理 |
| `weather` | 天気情報（wttr.in） |
| `healthcheck` | システムヘルスチェック（CPU / メモリ / ディスク） |
| `camsnap` | カメラ撮影（imagesnap） |
| `peekaboo` | スクリーンショット（screencapture） |
| `things-mac` | Things 3 タスク管理 |
| `bear-notes` | Bear ノート連携（x-callback-url） |
| `imsg` | iMessage 送受信 |
| `blucli` | Bluetooth 制御（blueutil） |
| `goplaces` | 地図・位置情報検索 |
| `voice-call` | 音声合成（macOS say） |

### 外部 API 連携（API キー設定時に有効化）

| スキル | 説明 | 必要な設定 |
|--------|------|-----------|
| `openai-image-gen` | DALL-E 画像生成 | `openai_api_key` |
| `openai-whisper-api` | 音声→テキスト (API) | `openai_api_key` |
| `openai-whisper` | 音声→テキスト (ローカル) | whisper.cpp |
| `sherpa-onnx-tts` | テキスト→音声 (ローカル) | sherpa-onnx |
| `gemini` | Google Gemini API | `gemini_api_key` |
| `notion` | Notion ページ操作 | `notion_token` |
| `trello` | Trello ボード・カード操作 | `trello_key` + `trello_token` |
| `obsidian` | Obsidian Vault 連携 | Vault パス |
| `spotify-player` | Spotify 再生操作 | `spotify_client_id` |
| `sonoscli` | Sonos スピーカー制御 | LAN 内デバイス |
| `1password` | 1Password CLI 連携 | `op` CLI |
| `openhue` | Philips Hue ライト制御 | Hue Bridge IP |
| `himalaya` | メール CLI（IMAP） | IMAP 設定 |
| `oracle` | Oracle Database 接続 | DB 接続情報 |
| `food-order` | フードデリバリー | サービス依存 |

### ユーティリティ

| スキル | 説明 |
|--------|------|
| `gifgrep` | GIF 検索 |
| `songsee` | 楽曲認識・歌詞検索 |
| `blogwatcher` | ブログ / RSS 監視 |
| `eightctl` | 8sleep マットレス制御 |
| `wacli` | WhatsApp CLI |
| `bluebubbles` | BlueBubbles (iMessage 代替) |
| `nano-banana-pro` | ハードウェアボード制御 |
| `ordercli` | 注文管理 CLI |

### メタ・フレームワーク

| スキル | 説明 |
|--------|------|
| `clawhub` | スキルマーケットプレース |
| `mcporter` | MCP サーバー連携 |
| `sag` | サブエージェント実行 |
| `gog` | Google 検索 + 要約 |

### API キーの設定方法

`~/.claude/env.yaml` に追加:

```yaml
openai_api_key: sk-...
gemini_api_key: AIza...
notion_token: ntn_...
```

各スキルの `SKILL.md` に必要な設定項目が記載されています。

---

## CLI コマンド

```
afk-code telegram setup     Telegram 認証設定
afk-code telegram           Telegram ボット起動（Heartbeat / Cron 含む）
afk-code discord setup      Discord 認証設定
afk-code discord            Discord ボット起動
afk-code slack setup        Slack 認証設定
afk-code slack              Slack ボット起動
afk-code run -- <cmd>       監視付きセッション起動（PTY）
afk-code run --restart -- <cmd>   クラッシュ時自動再起動モードで起動
afk-code init               メモリ・設定ファイル初期化 + スキルインストール
afk-code heartbeat status   Heartbeat ステータス表示
afk-code cron list          Cron ジョブ一覧
afk-code memory status      メモリステータス
afk-code memory list        日次ノート一覧
afk-code memory today       今日の日次ノート表示
afk-code status             全体ステータス表示
afk-code help               ヘルプ表示
```

---

## Telegram コマンド

| コマンド | 説明 |
|---------|------|
| `/switch [project]` | プロジェクト一覧表示 / プロジェクトに切り替え（未起動なら起動） |
| `/projects` | `/switch` のエイリアス |
| `/model <name>` | モデル切り替え（opus / sonnet / haiku） |
| `/compact` | 会話をコンパクト化 |
| `/background` | Ctrl+B 送信 |
| `/interrupt` | Escape 送信 |
| `/mode` | Shift+Tab 送信 |
| `/verbose` | ツールコール表示のオン / オフ切り替え |
| `/snapshot` `/sn` | 現在の画面を AI 分析（ステータス判定） |
| `/fork` | 現在のセッションを複製して新セッション起動 |
| `/rewind [turn]` | 会話ターン一覧表示 / 指定ターンに巻き戻し |
| `/heartbeat` | Heartbeat ステータス表示 |
| `/wakeup` | Heartbeat 手動トリガー |
| `/cron` | Cron ジョブ一覧 |
| `/memory` | メモリ概要表示 |
| `/soul` | SOUL.md 内容表示 |
| `/help` | コマンド一覧 |

---

## クライアント比較

| 機能 | Telegram | Discord | Slack |
|------|----------|---------|-------|
| Heartbeat / Cron | ✅ 対応 | 予定 | 予定 |
| マルチセッション | ✅ 切り替え式 | ✅ 対応 | ✅ 対応 |
| Fork / Rewind | ✅ 対応 | — | — |
| スナップショット分析 | ✅ 対応 | — | — |
| Permission 応答 | ✅ インラインキー | — | — |
| Siri 連携 | 送受信 | 受信のみ | 受信のみ |
| 画像送信 | ✅ 対応 | ✅ 対応 | ✅ 対応 |
| 権限 | 個人 | 個人 | 管理者 |

---

## tmux ショートカット

`~/.zshrc` に追加すると `afk` コマンド一発で全部起動できます:

```bash
afk() {
    source ~/.nvm/nvm.sh

    # projects.yaml から最初のプロジェクトを取得
    local config="$HOME/.afk-code/projects.yaml"
    if [[ ! -f "$config" ]]; then echo "Error: $config not found"; return 1; fi
    local name dir
    name=$(grep -A1 '^projects:' "$config" | tail -1 | sed 's/^ *//' | cut -d: -f1)
    dir=$(grep -A1 '^projects:' "$config" | tail -1 | sed 's/^ *//' | cut -d: -f2 \
          | sed 's/^ *//' | sed "s|~|$HOME|")

    # 二重起動防止: tmux 外で動いている afk-code telegram を kill
    local rogue=$(pgrep -f "afk-code telegram" 2>/dev/null)
    if [[ -n "$rogue" ]] && ! tmux has-session -t afk 2>/dev/null; then
        echo "警告: tmux 外の afk-code telegram (PID: $rogue) を終了します"
        kill $rogue 2>/dev/null
        sleep 2
    fi

    # 既存の afk セッションを削除して再起動
    if tmux has-session -t afk 2>/dev/null; then
        tmux kill-session -t afk
        echo "既存の afk セッションを削除"
        sleep 1
    fi

    # Telegram ボット + 最初のプロジェクトで起動
    tmux new-session -d -s afk -n telegram \
        'unset CLAUDECODE; source ~/.nvm/nvm.sh && afk-code telegram'
    sleep 2
    echo "Telegram bot 起動"

    tmux new-window -t afk -n "$name" \
        "unset CLAUDECODE; cd '$dir' && source ~/.nvm/nvm.sh && \
         afk-code run --restart -- claude --dangerously-skip-permissions --continue"
    echo "セッション '$name' 起動。attach します..."
    tmux attach -t afk
}
```

`afk` で Telegram ボットと `projects.yaml` の最初のプロジェクトが起動します。  
追加セッションは Telegram から `/switch <project>` で起動できます。

---

## ログ確認

```bash
# リアルタイムでログを見る
tail -f ~/.afk-code/logs/telegram-$(date +%Y-%m-%d).log

# エラーのみ抽出
grep ERROR ~/.afk-code/logs/telegram-$(date +%Y-%m-%d).log
```

---

## 制限事項

- Heartbeat / Cron は現在 Telegram のみ対応（Discord / Slack は将来対応予定）
- Fork / Rewind / スナップショット分析は Telegram のみ
- Claude Code セッションが起動していない場合、Heartbeat / Cron はスキップされる
- インタラクティブ UI（選択プロンプト等）はリモート非対応。`/mode` (Shift+Tab) で代替可能

---

## 謝辞

本プロジェクトは **[Colin Harman](https://github.com/colinharman)** 氏によるオリジナル [afk-code](https://github.com/colinharman/afk-code) をフォークし、大幅に機能拡張したものです。  
永続メモリシステムのアイデアは **[OpenClaw](https://github.com/openclaw/openclaw)** にインスパイアされています。  
オリジナルの実装と先駆的なコンセプトに深く感謝します。

---

## 免責事項

本プロジェクトは Anthropic と無関係です。ご利用は自己責任でお願いします。

## ライセンス

MIT

---
---

# English Version

# AFK Code

Monitor, interact with, and **autonomously run** Claude Code sessions from Telegram, Slack, or Discord.  
Built-in persistent memory, Heartbeat autonomous actions, Cron scheduler, and 50+ skills.

<img src="https://github.com/user-attachments/assets/83083b63-9ca2-4ef0-b83d-fcc51bd2fff9" alt="AFK Code screenshot" width="420">

---

## Features

| Feature | Description |
|---------|-------------|
| **Remote Control** | Operate Claude Code from Telegram, Slack, or Discord |
| **Heartbeat** | Claude autonomously checks in every 30 minutes and acts on its own |
| **Cron Jobs** | Schedule tasks with crontab expressions |
| **Persistent Memory** | SOUL.md / MEMORY.md / daily notes for long-term context |
| **Multi-Session** | Run multiple projects simultaneously and switch between them |
| **Fork / Rewind** | Clone sessions or roll back to any past conversation turn |
| **Snapshot Analysis** | AI analyzes the current screen and reports Claude's status |
| **Image Support** | Auto-detect and send images to your messaging app |
| **Crash Resilience** | AutoRestart loop recovers the Telegram bot automatically |
| **50+ Skills** | Weather, Apple integrations, external APIs, smart home, and more |

---

## Quick Start

### 1. Install

```bash
npm install -g afk-code
```

Requires Node.js 18+.

### 2. Setup a Messaging Client

```bash
# Telegram (recommended — full Heartbeat/Cron support)
afk-code telegram setup

# Or Discord / Slack
afk-code discord setup
afk-code slack setup
```

### 3. Initialize Memory & Skills

```bash
afk-code init
```

Creates personality/memory files in `~/.afk-code/` and installs bundled skills as symlinks to `~/.claude/skills/`.

### 4. Run

```bash
# Terminal 1: Bot + Heartbeat + Cron
afk-code telegram

# Terminal 2: Claude Code session
afk-code run --restart -- claude
```

Or launch everything with tmux:

```bash
afk    # see "tmux Shortcut" section
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              User (Telegram / Slack / Discord)           │
└──────────────────────┬───────────────────────────────────┘
                       │
           ┌───────────▼────────────┐
           │  Bot (grammY / Bolt /  │
           │  discord.js)           │
           └───────────┬────────────┘
                       │
           ┌───────────▼────────────────────────┐
           │  SessionManager                    │
           │  Unix socket /tmp/afk-code-daemon  │
           │  JSONL file watcher                │
           └───────────┬────────────────────────┘
                       │
           ┌───────────▼────────────┐
           │  afk-code run          │
           │  PTY (node-pty)        │
           │  auto-reconnect (5s)   │
           └───────────┬────────────┘
                       │
           ┌───────────▼────────────┐
           │  Claude Code process   │
           └────────────────────────┘

Side systems:
┌──────────────────────────────────────────────────────────┐
│  Scheduler                                               │
│  ├── Heartbeat Engine (every 30 min, skips quiet hours) │
│  └── Cron Engine (crontab-style, hot reload)            │
├──────────────────────────────────────────────────────────┤
│  AutoRestart Loop (auto-recovery on crash)               │
│  File Logger (~/.afk-code/logs/, 7-day rotation)        │
└──────────────────────────────────────────────────────────┘
```

1. `afk-code telegram` starts the bot, Heartbeat engine, and Cron scheduler
2. `afk-code run --restart -- claude` spawns Claude Code in a PTY and connects via Unix socket
3. JSONL file watching relays messages bidirectionally
4. Heartbeat periodically sends check-in prompts to Claude Code
5. Cron sends scheduled task prompts at configured times
6. Claude Code reads SOUL.md, HEARTBEAT.md, MEMORY.md for personality and context

---

## Heartbeat

The Heartbeat system transforms Claude from reactive to proactive.  
Every 30 minutes, afk-code sends a check-in prompt. Claude reads `~/.afk-code/HEARTBEAT.md` and autonomously decides what to do.

**Configuration** (`~/.afk-code/scheduler.yaml`):

```yaml
heartbeat:
  enabled: true
  interval_minutes: 30
  quiet_hours:
    start: 23
    end: 7
  max_consecutive_skips: 3
  silent_relay: true      # Don't relay the prompt to messaging apps
```

**Customize the checklist** (`~/.afk-code/HEARTBEAT.md`):

```markdown
## Every check
- [ ] Today's weather
- [ ] Any overdue Apple Reminders?
- [ ] Create/update daily note

## Conditional
- [ ] Curate MEMORY.md if not updated in 3+ days
```

Telegram commands:
- `/heartbeat` — Show status
- `/wakeup` — Trigger manually

---

## Cron Jobs

Schedule tasks at exact times using crontab expressions.  
Changes to `cron.yaml` are auto-detected and applied within 60 seconds (hot reload).

**Configuration** (`~/.afk-code/cron.yaml`):

```yaml
jobs:
  - id: morning-briefing
    name: Morning Briefing
    schedule: "0 8 * * *"
    prompt: |
      Good morning. Please give me a briefing:
      1. Today's weather
      2. Important follow-ups from yesterday
      3. Any reminders for today
    enabled: true
    silent_relay: false    # Relay the prompt to Telegram
```

**Cron expression format**:

```
+---- minute (0-59)
| +-- hour (0-23)
| | + day of month (1-31)
| | | + month (1-12)
| | | | + day of week (0-7, 0=Sun)
| | | | |
* * * * *
```

---

## Persistent Memory

```
~/.afk-code/
├── SOUL.md            # AI personality and values
├── HEARTBEAT.md       # Heartbeat checklist
├── MEMORY.md          # Long-term curated memory
├── projects.yaml      # Registered project directories
├── scheduler.yaml     # Heartbeat configuration
├── cron.yaml          # Cron job definitions
├── config.yaml        # Relay filter configuration
├── memory/            # Daily notes
│   └── 2026-04-01.md
└── logs/              # File logs (7-day retention)
    └── telegram-2026-04-01.log
```

| File | Purpose |
|------|---------|
| `SOUL.md` | Defines the AI's personality, values, and behavior |
| `HEARTBEAT.md` | Checklist for autonomous Heartbeat actions |
| `MEMORY.md` | Long-term memory, curated from daily notes |
| `projects.yaml` | Whitelisted project directories for remote session creation |
| `scheduler.yaml` | Heartbeat interval, quiet hours, skip limits |
| `cron.yaml` | Cron job definitions (hot reload) |
| `config.yaml` | Relay filters to suppress noise |
| `memory/YYYY-MM-DD.md` | Daily activity log (auto-generated) |

---

## Conversation Log Script (`scripts/log_conversation.py`)

Automatically appends Claude Code conversations to daily notes. Integrate it into Heartbeat to maintain a cross-session conversation history.

**Setup (2 steps):**

① Add to `~/.claude/env.yaml`:
```yaml
local_timezone_offset: 9   # N for UTC+N (Japan: 9)
```

② Add to `~/.claude/lib/load_env.sh` (right after the `OUTPUT_DIR` block):
```bash
export LOCAL_TIMEZONE_OFFSET=$(get_yaml_value "local_timezone_offset")
[ -z "$LOCAL_TIMEZONE_OFFSET" ] && export LOCAL_TIMEZONE_OFFSET="9"
```

**Example HEARTBEAT.md integration:**
```markdown
## Every check
- [ ] Append conversation log to daily note
  (run_python ~/.afk-code/scripts/log_conversation.py)
```

**Features:**
- Scans all projects under `~/.claude/projects/`
- Extracts only new entries since the last run (no duplicates)
- Appends to `~/.afk-code/memory/YYYY-MM-DD.md` per local date
- Auto-filters system messages: `[HEARTBEAT`, `[CRON:`, etc.

> `load_env.sh` lives in the `~/.claude` repository, which is managed separately from afk-code. If you version-control `~/.claude`, commit that change there.

---

## Relay Filter

Suppress system messages auto-injected by Claude Code, or filter out prompts you don't want visible in chat.

**Configuration** (`~/.afk-code/config.yaml`):

```yaml
relay:
  # Skip user-role messages with these prefixes
  suppress_user_message_prefixes:
    - "<task-notification>"
    - "<local-command-caveat>"
    - "<command-name>"
    - "[CRON: morning-briefing]"   # Hide cron prompt from chat

  # Skip assistant-role messages with these prefixes
  suppress_assistant_message_prefixes:
    - "📰 News:"
    - "[INTERNAL]"
```

---

## Multi-Session

Register project directories in `~/.afk-code/projects.yaml` and start/switch sessions from Telegram.

```yaml
projects:
  my-app: ~/my-app
  website: ~/website
  research: /workspace/research
```

From Telegram:

```
/switch              → Lists: 🟢 my-app ⭐, ⚪ website
/switch website      → Starts ~/website session (or switches to it)
```

- The first session started becomes the **primary session** (⭐), which Heartbeat/Cron always targets.
- If only one session is active, it is auto-selected.

---

## Fork / Rewind

Advanced session management for parallel work and history exploration.

**Fork** — Clone the current session for parallel work:

```
/fork   → Copies current JSONL, starts a new session (R1, R2...)
```

**Rewind** — Roll back to any past conversation turn:

```
/rewind        → Lists all conversation turns with summaries
/rewind 5      → Starts a new session truncated to turn 5
```

---

## Snapshot Analysis

Analyze the current Claude Code screen with AI to check session status.

```
/snapshot  or  /sn
```

Claude inspects the screen and reports:
- `waiting` — Waiting for user input
- `working` — Running tools or processing
- `idle` — Completed, standing by
- `error` — An error occurred

An inline **Ctrl+C** button lets you interrupt without leaving Telegram.

---

## Permission / Plan Mode

Respond to Claude Code's prompts directly from Telegram.

**Permission prompt detected**:

```
[Claude requested permissions]
1️⃣ Clear ctx + bypass   2️⃣ Bypass perms   3️⃣ Manual approve
```

**Plan Mode detected**:

```
[Plan mode: ExitPlanMode detected]
→ Plan file contents are shown
→ Reply with text to give feedback
```

---

## Crash Resilience

| Feature | Description |
|---------|-------------|
| **AutoRestart loop** | Telegram bot restarts automatically on crash. Quick crashes (<10s) wait 45s before restarting (longer than Telegram's 30s long-poll TTL, preventing 409 Conflict) |
| **getUpdates pre-call** | Clears stale long-poll connections before `bot.start()` to prevent 409 errors |
| **Unix socket auto-reconnect** | `afk-code run` retries connection to the daemon every 5 seconds on disconnect |
| **OOM guard** | Message buffers are capped at 50MB; old data is evicted on overflow |
| **seenMessages eviction** | Deduplication cache capped at 50,000 entries |
| **File logger** | All logs written to `~/.afk-code/logs/telegram-YYYY-MM-DD.log` with 7-day rotation. `uncaughtException` and `unhandledRejection` are captured with full stack traces |

---

## Skills (50+)

Bundled in `skills/` and installed as symlinks to `~/.claude/skills/` via `afk-code init`.

### Mac Native (no API key required)

| Skill | Description |
|-------|-------------|
| `apple-notes` | Read/write Apple Notes |
| `apple-reminders` | Manage Apple Reminders |
| `weather` | Weather via wttr.in |
| `healthcheck` | System health (CPU, memory, disk) |
| `camsnap` | Camera capture via imagesnap |
| `peekaboo` | Screenshot via screencapture |
| `things-mac` | Things 3 task management |
| `bear-notes` | Bear notes via x-callback-url |
| `imsg` | iMessage send/receive |
| `blucli` | Bluetooth control via blueutil |
| `goplaces` | Maps and location search |
| `voice-call` | Text-to-speech via macOS `say` |

### External API (requires API keys)

| Skill | Description | Setup |
|-------|-------------|-------|
| `openai-image-gen` | DALL-E image generation | `openai_api_key` |
| `openai-whisper-api` | Speech-to-text (API) | `openai_api_key` |
| `openai-whisper` | Speech-to-text (local) | whisper.cpp |
| `sherpa-onnx-tts` | Text-to-speech (local) | sherpa-onnx |
| `gemini` | Google Gemini API | `gemini_api_key` |
| `notion` | Notion pages | `notion_token` |
| `trello` | Trello boards/cards | `trello_key` + `trello_token` |
| `obsidian` | Obsidian vault | Vault path |
| `spotify-player` | Spotify playback | `spotify_client_id` |
| `sonoscli` | Sonos speakers | LAN device |
| `1password` | 1Password CLI | `op` CLI |
| `openhue` | Philips Hue lights | Hue Bridge IP |
| `himalaya` | Email via CLI | IMAP config |
| `oracle` | Oracle Database | DB connection |
| `food-order` | Food delivery | Service-dependent |

### Utilities

| Skill | Description |
|-------|-------------|
| `gifgrep` | GIF search |
| `songsee` | Song identification and lyrics |
| `blogwatcher` | Blog/RSS monitoring |
| `eightctl` | 8sleep mattress control |
| `wacli` | WhatsApp CLI |
| `bluebubbles` | BlueBubbles (iMessage alternative) |
| `nano-banana-pro` | Hardware board control |
| `ordercli` | Order management CLI |

### Meta / Framework

| Skill | Description |
|-------|-------------|
| `clawhub` | Skill marketplace |
| `mcporter` | MCP server integration |
| `sag` | Sub-agent execution |
| `gog` | Google search + summarize |

### API Key Configuration

Add API keys to `~/.claude/env.yaml`:

```yaml
openai_api_key: sk-...
gemini_api_key: AIza...
notion_token: ntn_...
```

Each skill's `SKILL.md` documents its required configuration.

---

## CLI Commands

```
afk-code telegram setup       Setup Telegram bot credentials
afk-code telegram             Start Telegram bot (+ Heartbeat/Cron)
afk-code discord setup        Setup Discord bot credentials
afk-code discord              Start Discord bot
afk-code slack setup          Setup Slack app credentials
afk-code slack                Start Slack bot
afk-code run -- <command>     Start a monitored session
afk-code run --restart -- <cmd>  Start with auto-restart on crash
afk-code init                 Initialize memory files and install skills
afk-code heartbeat status     Show Heartbeat status
afk-code cron list            List Cron jobs
afk-code memory status        Show memory status
afk-code memory list          List daily notes
afk-code memory today         Show today's daily note
afk-code status               Show overall status
afk-code help                 Show help
```

---

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/switch [project]` | List projects / switch to project (starts if not running) |
| `/projects` | Alias for `/switch` |
| `/model <name>` | Switch model (opus / sonnet / haiku) |
| `/compact` | Compact conversation |
| `/background` | Send Ctrl+B |
| `/interrupt` | Send Escape |
| `/mode` | Send Shift+Tab |
| `/verbose` | Toggle tool call display on/off |
| `/snapshot` `/sn` | AI analysis of current screen |
| `/fork` | Fork current session to a new one |
| `/rewind [turn]` | List turns / roll back to turn N |
| `/heartbeat` | Show Heartbeat status |
| `/wakeup` | Trigger Heartbeat manually |
| `/cron` | List Cron jobs |
| `/memory` | Show memory overview |
| `/soul` | Show SOUL.md contents |
| `/help` | Show command list |

---

## Client Comparison

| Feature | Telegram | Discord | Slack |
|---------|----------|---------|-------|
| Heartbeat / Cron | ✅ | Planned | Planned |
| Multi-session | ✅ | ✅ | ✅ |
| Fork / Rewind | ✅ | — | — |
| Snapshot analysis | ✅ | — | — |
| Permission response | ✅ inline | — | — |
| Siri integration | Send & receive | Receive only | Receive only |
| Image support | ✅ | ✅ | ✅ |
| Auth scope | Personal | Personal | Admin |

---

## tmux Shortcut

Add to `~/.zshrc`:

```bash
afk() {
    source ~/.nvm/nvm.sh

    # Read first project from projects.yaml
    local config="$HOME/.afk-code/projects.yaml"
    if [[ ! -f "$config" ]]; then echo "Error: $config not found"; return 1; fi
    local name dir
    name=$(grep -A1 '^projects:' "$config" | tail -1 | sed 's/^ *//' | cut -d: -f1)
    dir=$(grep -A1 '^projects:' "$config" | tail -1 | sed 's/^ *//' | cut -d: -f2 \
          | sed 's/^ *//' | sed "s|~|$HOME|")

    # Guard against stale telegram process outside tmux
    local rogue=$(pgrep -f "afk-code telegram" 2>/dev/null)
    if [[ -n "$rogue" ]] && ! tmux has-session -t afk 2>/dev/null; then
        echo "Warning: killing rogue afk-code telegram (PID: $rogue)"
        kill $rogue 2>/dev/null
        sleep 2
    fi

    # Kill existing afk session and restart fresh
    if tmux has-session -t afk 2>/dev/null; then
        tmux kill-session -t afk
        sleep 1
    fi

    # Start Telegram bot + first project session
    tmux new-session -d -s afk -n telegram \
        'unset CLAUDECODE; source ~/.nvm/nvm.sh && afk-code telegram'
    sleep 2

    tmux new-window -t afk -n "$name" \
        "unset CLAUDECODE; cd '$dir' && source ~/.nvm/nvm.sh && \
         afk-code run --restart -- claude --dangerously-skip-permissions --continue"
    echo "Session '$name' started. Attaching..."
    tmux attach -t afk
}
```

`afk` starts the Telegram bot and the first project from `projects.yaml`.  
Additional sessions can be started from Telegram with `/switch <project>`.

---

## Log Inspection

```bash
# Stream live logs
tail -f ~/.afk-code/logs/telegram-$(date +%Y-%m-%d).log

# Filter errors only
grep ERROR ~/.afk-code/logs/telegram-$(date +%Y-%m-%d).log
```

---

## Limitations

- Heartbeat/Cron currently supported on Telegram only (Discord/Slack planned)
- Fork/Rewind/Snapshot are Telegram-only
- Heartbeat/Cron are skipped when no Claude Code session is running
- Interactive prompts (selection UI, etc.) are not supported remotely — use `/mode` as a workaround

---

## Acknowledgements

This project is a fork of the original **[afk-code](https://github.com/colinharman/afk-code)** by **[Colin Harman](https://github.com/colinharman)**, extended with substantial new features.  
The persistent memory system concept is inspired by **[OpenClaw](https://github.com/openclaw/openclaw)**.  
Deep thanks to both for their pioneering work.

---

## Disclaimer

This project is not affiliated with Anthropic. Use at your own risk.

## License

MIT
