# AFK Code

Monitor, interact with, and **autonomously run** Claude Code sessions from Telegram, Slack, or Discord. Built-in persistent memory, heartbeat-driven autonomous actions, and 50+ skills — inspired by [OpenClaw](https://github.com/openclaw/openclaw).

> **[日本語版は下にあります / Japanese version below](#日本語版)**

<img src="https://github.com/user-attachments/assets/83083b63-9ca2-4ef0-b83d-fcc51bd2fff9" alt="AFK Code screenshot" width="400">

## Features

| Feature | Description |
|---------|-------------|
| **Remote Control** | Operate Claude Code sessions from Telegram, Slack, or Discord |
| **Heartbeat** | Autonomous check-ins every 30 minutes — Claude acts on its own |
| **Cron Jobs** | Schedule tasks with crontab expressions |
| **Persistent Memory** | SOUL.md / MEMORY.md / daily notes for long-term context |
| **50+ Skills** | Weather, Apple integrations, APIs, smart home, and more |
| **Image Support** | Auto-detect and send images to your messaging app |

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

This creates personality/memory files in `~/.afk-code/` and installs bundled skills as symlinks to `~/.claude/skills/`.

### 4. Run

```bash
# Terminal 1: Bot + Heartbeat + Cron
afk-code telegram

# Terminal 2: Claude Code session
afk-code run -- claude
```

Or launch both in one command with tmux:

```bash
afk    # see "tmux Shortcut" section below
```

## Architecture

```
User <-> Telegram <-> afk-code <-> Claude Code (PTY)
                         |
                    Scheduler
                    +-- Heartbeat (every 30 min)
                    +-- Cron (crontab-style)
```

1. `afk-code telegram` starts the bot, Heartbeat engine, and Cron scheduler
2. `afk-code run -- claude` spawns Claude Code in a PTY and connects via Unix socket
3. JSONL file watching relays messages bidirectionally
4. Heartbeat periodically sends check-in prompts to Claude Code
5. Cron sends scheduled task prompts at configured times
6. Claude Code reads SOUL.md, HEARTBEAT.md, MEMORY.md for personality and context

## Heartbeat

The Heartbeat system transforms Claude from reactive to proactive. Every 30 minutes, afk-code sends a check-in prompt. Claude reads `~/.afk-code/HEARTBEAT.md` and autonomously decides what to do.

**Configuration** (`~/.afk-code/scheduler.yaml`):

```yaml
heartbeat:
  enabled: true
  interval_minutes: 30
  quiet_hours:
    start: 23
    end: 7
  max_consecutive_skips: 3
  silent_relay: true      # Don't relay the prompt to messaging apps (default: true)
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

## Cron Jobs

Schedule tasks at exact times using crontab expressions.

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
    silent_relay: false    # Relay the prompt to messaging apps (default: false)
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

## Persistent Memory

Inspired by OpenClaw's memory system.

```
~/.afk-code/
+-- SOUL.md            # AI personality and values
+-- HEARTBEAT.md       # Heartbeat checklist
+-- MEMORY.md          # Long-term curated memory
+-- scheduler.yaml     # Heartbeat configuration
+-- cron.yaml          # Cron job definitions
+-- memory/            # Daily notes
    +-- 2026-02-20.md
    +-- 2026-02-21.md
```

| File | Purpose |
|------|---------|
| `SOUL.md` | Defines the AI's personality, values, and behavior |
| `HEARTBEAT.md` | Checklist for autonomous Heartbeat actions |
| `MEMORY.md` | Long-term memory, curated from daily notes |
| `memory/YYYY-MM-DD.md` | Daily activity log |

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

## CLI Commands

```
afk-code telegram setup     Setup Telegram bot credentials
afk-code telegram           Start Telegram bot (+ Heartbeat/Cron)
afk-code discord setup      Setup Discord bot credentials
afk-code discord            Start Discord bot
afk-code slack setup        Setup Slack app credentials
afk-code slack              Start Slack bot
afk-code run -- <command>   Start a monitored session
afk-code init               Initialize memory files and install skills
afk-code heartbeat status   Show Heartbeat status
afk-code cron list          List Cron jobs
afk-code memory status      Show memory status
afk-code memory list        List daily notes
afk-code memory today       Show today's daily note
afk-code status             Show overall status
afk-code help               Show help
```

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/sessions` | List active sessions |
| `/switch <name>` | Switch session |
| `/model <name>` | Switch model (opus/sonnet/haiku) |
| `/compact` | Compact conversation |
| `/background` | Send Ctrl+B |
| `/interrupt` | Send Escape |
| `/mode` | Send Shift+Tab |
| `/heartbeat` | Show Heartbeat status |
| `/wakeup` | Trigger Heartbeat manually |
| `/cron` | List Cron jobs |
| `/memory` | Show memory overview |
| `/soul` | Show SOUL.md contents |
| `/help` | Show command list |

## Client Comparison

| | Telegram | Discord | Slack |
|---|---|---|---|
| Siri integration | Send & Receive | Receive only | Receive only |
| Multi-session | Switchable | Yes | Yes |
| Heartbeat/Cron | Yes | Planned | Planned |
| Permissions | Personal | Personal | Admin |
| Image support | Yes | Yes | Yes |

## tmux Shortcut

Add to `~/.zshrc`:

```bash
afk() {
    source ~/.nvm/nvm.sh
    if tmux has-session -t afk-bot 2>/dev/null; then
        echo "afk-bot is already running. Use: tmux attach -t afk-bot"
        return 0
    fi
    tmux new-session -d -s afk-bot 'source ~/.nvm/nvm.sh && afk-code telegram'
    sleep 2
    tmux split-window -t afk-bot \
        "cd ~ && source ~/.nvm/nvm.sh && afk-code run -- claude --dangerously-skip-permissions"
    echo "AFK Code launched! Send messages from Telegram."
    echo "Heartbeat: autonomous check-ins every 30 min"
    echo "Check: tmux attach -t afk-bot"
}
```

## Limitations

- Heartbeat/Cron currently supported on Telegram only (Discord/Slack planned)
- Heartbeat/Cron are skipped when no Claude Code session is running
- Interactive prompts (plan mode, selection UI) are not supported remotely — use `/mode` as a workaround

## Inspired By

- [OpenClaw](https://github.com/openclaw/openclaw) - Open-source autonomous AI assistant

## Disclaimer

This project is not affiliated with Anthropic. Use at your own risk.

## License

MIT

---

---

# 日本語版

## AFK Code

Telegram、Slack、Discord から Claude Code セッションを監視・操作し、**自律的に動かす**ためのツール。永続メモリ、Heartbeat による自律行動、50以上のスキルを搭載。[OpenClaw](https://github.com/openclaw/openclaw) にインスパイアされています。

<img src="https://github.com/user-attachments/assets/83083b63-9ca2-4ef0-b83d-fcc51bd2fff9" alt="AFK Code スクリーンショット" width="400">

## 主な機能

| 機能 | 説明 |
|------|------|
| **リモート操作** | Telegram/Slack/Discord から Claude Code セッションを操作 |
| **Heartbeat** | 30分間隔で自律的にタスクを確認・実行 |
| **Cronジョブ** | crontab式でタスクを定時実行 |
| **永続メモリ** | SOUL.md / MEMORY.md / 日次ノートで長期記憶を維持 |
| **50+スキル** | 天気、Apple連携、外部API、スマートホーム等 |
| **画像対応** | 画像ファイルの自動検出・送信 |

## クイックスタート

### 1. インストール

```bash
npm install -g afk-code
```

Node.js 18以上が必要です。

### 2. メッセージングクライアントの設定

```bash
# Telegram（推奨 — Heartbeat/Cronフルサポート）
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
# ターミナル1: ボット + Heartbeat + Cron
afk-code telegram

# ターミナル2: Claude Code セッション
afk-code run -- claude
```

tmux で一括起動もできます:

```bash
afk    # 下記「tmuxショートカット」参照
```

## アーキテクチャ

```
ユーザー <-> Telegram <-> afk-code <-> Claude Code (PTY)
                            |
                       Scheduler
                       +-- Heartbeat (30分間隔)
                       +-- Cron (crontab式)
```

1. `afk-code telegram` でボット・Heartbeat・Cronスケジューラーを起動
2. `afk-code run -- claude` でClaude CodeをPTYで起動し、Unix socketで接続
3. JSONLファイル監視でメッセージを双方向に中継
4. Heartbeat が定期的にチェックインプロンプトを送信
5. Cron が設定した時刻にタスクプロンプトを送信
6. Claude Code が SOUL.md / HEARTBEAT.md / MEMORY.md を読み込み、文脈を維持

## Heartbeat

Heartbeat は Claude を「反応型」から「能動型」に変えるコア機能です。30分ごとにチェックインし、Claude が `~/.afk-code/HEARTBEAT.md` を読んで自律的に判断・行動します。

**設定** (`~/.afk-code/scheduler.yaml`):

```yaml
heartbeat:
  enabled: true
  interval_minutes: 30
  quiet_hours:
    start: 23    # 23:00〜7:00は静粛
    end: 7
  max_consecutive_skips: 3
  silent_relay: true       # プロンプトをメッセージアプリに中継しない（デフォルト: true）
```

**チェックリストのカスタマイズ** (`~/.afk-code/HEARTBEAT.md`):

```markdown
## 毎回確認
- [ ] 今日の天気
- [ ] Apple Reminders に期限切れタスクがないか
- [ ] 日次ノートの作成/更新

## 条件付き
- [ ] MEMORY.md が3日以上更新されていなければキュレーション
```

## Cronジョブ

crontab式でタスクを正確な時刻に実行します。

**設定** (`~/.afk-code/cron.yaml`):

```yaml
jobs:
  - id: morning-briefing
    name: 朝のブリーフィング
    schedule: "0 8 * * *"        # 毎朝8:00
    prompt: |
      おはようございます。朝のブリーフィング:
      1. 今日の天気
      2. 昨日の重要フォローアップ
      3. 今日のリマインダー
    enabled: true
    silent_relay: false          # プロンプトをメッセージアプリに中継する（デフォルト: false）
```

**Cron式の書き方**:

```
┌──── 分 (0-59)
│ ┌── 時 (0-23)
│ │ ┌ 日 (1-31)
│ │ │ ┌ 月 (1-12)
│ │ │ │ ┌ 曜日 (0-7, 0=日曜)
│ │ │ │ │
* * * * *
```

例: `0 9 * * *`(毎朝9:00）/ `*/30 * * * *`（30分ごと）/ `0 9 * * 1-5`（平日9:00）

## 永続メモリ

OpenClaw のメモリシステムにインスパイアされた永続記憶機構です。

```
~/.afk-code/
+-- SOUL.md            # パーソナリティ定義
+-- HEARTBEAT.md       # Heartbeat チェックリスト
+-- MEMORY.md          # 長期記憶（キュレーション済み）
+-- scheduler.yaml     # Heartbeat 設定
+-- cron.yaml          # Cron ジョブ定義
+-- memory/            # 日次ノート
    +-- 2026-02-20.md
    +-- 2026-02-21.md
```

| ファイル | 役割 |
|---------|------|
| `SOUL.md` | AIの「魂」。人格・振る舞い・価値観を定義 |
| `HEARTBEAT.md` | Heartbeat 時のチェックリスト |
| `MEMORY.md` | 長期記憶。重要な情報をキュレーション |
| `memory/YYYY-MM-DD.md` | 日次ノート。その日の活動ログ |

## スキル (50+)

`skills/` に同梱。`afk-code init` で `~/.claude/skills/` にシンボリックリンクとしてインストールされます。

### Mac ネイティブ（APIキー不要）

| スキル | 説明 |
|--------|------|
| `apple-notes` | Apple Notes 読み書き |
| `apple-reminders` | Apple Reminders 管理 |
| `weather` | 天気情報（wttr.in） |
| `healthcheck` | システムヘルスチェック |
| `camsnap` | カメラ撮影（imagesnap） |
| `peekaboo` | スクリーンショット |
| `things-mac` | Things 3 タスク管理 |
| `bear-notes` | Bear ノート連携 |
| `imsg` | iMessage 送受信 |
| `blucli` | Bluetooth 制御 |
| `goplaces` | 地図・位置情報 |
| `voice-call` | 音声合成（macOS say） |

### 外部API連携（APIキー設定時に有効化）

| スキル | 説明 | 必要な設定 |
|--------|------|-----------|
| `openai-image-gen` | DALL-E 画像生成 | `openai_api_key` |
| `openai-whisper-api` | 音声→テキスト (API) | `openai_api_key` |
| `openai-whisper` | 音声→テキスト (ローカル) | whisper.cpp |
| `sherpa-onnx-tts` | テキスト→音声 | sherpa-onnx |
| `gemini` | Gemini API | `gemini_api_key` |
| `notion` | Notion 操作 | `notion_token` |
| `trello` | Trello 操作 | `trello_key` + `trello_token` |
| `obsidian` | Obsidian 連携 | Vault path |
| `spotify-player` | Spotify 操作 | `spotify_client_id` |
| `sonoscli` | Sonos 制御 | LAN内デバイス |
| `1password` | 1Password 操作 | `op` CLI |
| `openhue` | Philips Hue ライト | Hue Bridge IP |
| `himalaya` | メール CLI | IMAP 設定 |
| `oracle` | Oracle DB | DB接続情報 |
| `food-order` | フードデリバリー | サービス依存 |

### ユーティリティ

| スキル | 説明 |
|--------|------|
| `gifgrep` | GIF 検索 |
| `songsee` | 楽曲認識・歌詞検索 |
| `blogwatcher` | ブログ/RSS 監視 |
| `eightctl` | 8sleep 制御 |
| `wacli` | WhatsApp CLI |
| `bluebubbles` | BlueBubbles (iMessage代替) |
| `nano-banana-pro` | ハードウェアボード制御 |
| `ordercli` | 注文管理 CLI |

### メタ・フレームワーク

| スキル | 説明 |
|--------|------|
| `clawhub` | スキルマーケットプレース |
| `mcporter` | MCP サーバー連携 |
| `sag` | サブエージェント実行 |
| `gog` | Google 検索+要約 |

### APIキーの設定方法

`~/.claude/env.yaml` にAPIキーを追加:

```yaml
openai_api_key: sk-...
gemini_api_key: AIza...
notion_token: ntn_...
```

各スキルの `SKILL.md` に必要な設定項目が記載されています。

## CLI コマンド

```
afk-code telegram setup     Telegram 認証設定
afk-code telegram           Telegram ボット起動（Heartbeat/Cron含む）
afk-code discord setup      Discord 認証設定
afk-code discord            Discord ボット起動
afk-code slack setup        Slack 認証設定
afk-code slack              Slack ボット起動
afk-code run -- <command>   監視付きセッション起動
afk-code init               メモリ・設定ファイル初期化 + スキルインストール
afk-code heartbeat status   Heartbeat ステータス表示
afk-code cron list          Cron ジョブ一覧
afk-code memory status      メモリステータス
afk-code memory list        日次ノート一覧
afk-code memory today       今日の日次ノート表示
afk-code status             全体ステータス表示
afk-code help               ヘルプ表示
```

## Telegram コマンド

| コマンド | 説明 |
|---------|------|
| `/sessions` | アクティブセッション一覧 |
| `/switch <name>` | セッション切り替え |
| `/model <name>` | モデル切り替え (opus/sonnet/haiku) |
| `/compact` | 会話をコンパクト化 |
| `/background` | Ctrl+B 送信 |
| `/interrupt` | Escape 送信 |
| `/mode` | Shift+Tab 送信 |
| `/heartbeat` | Heartbeat ステータス表示 |
| `/wakeup` | Heartbeat 手動トリガー |
| `/cron` | Cron ジョブ一覧 |
| `/memory` | メモリ概要表示 |
| `/soul` | SOUL.md 内容表示 |
| `/help` | コマンド一覧 |

## クライアント比較

| | Telegram | Discord | Slack |
|---|---|---|---|
| Siri連携 | 送受信 | 受信のみ | 受信のみ |
| マルチセッション | 切り替え式 | 対応 | 対応 |
| Heartbeat/Cron | 対応 | 予定 | 予定 |
| 権限 | 個人 | 個人 | 管理者 |
| 画像対応 | 対応 | 対応 | 対応 |

## tmux ショートカット

`~/.zshrc` に追加:

```bash
afk() {
    source ~/.nvm/nvm.sh
    if tmux has-session -t afk-bot 2>/dev/null; then
        echo "afk-bot は既に起動中です。確認: tmux attach -t afk-bot"
        return 0
    fi
    tmux new-session -d -s afk-bot 'source ~/.nvm/nvm.sh && afk-code telegram'
    sleep 2
    tmux split-window -t afk-bot \
        "cd ~ && source ~/.nvm/nvm.sh && afk-code run -- claude --dangerously-skip-permissions"
    echo "AFK Code 起動完了！ Telegram からメッセージを送れます"
    echo "Heartbeat: 30分間隔で自律チェック稼働中"
    echo "確認: tmux attach -t afk-bot"
}
```

## 制限事項

- Heartbeat/Cron は現在 Telegram のみ対応（Discord/Slack は将来対応予定）
- Claude Code セッションが起動していない場合、Heartbeat/Cron はスキップされる
- インタラクティブプロンプト（plan mode、選択UI）はリモート非対応（`/mode` で回避可）

## インスパイア元

- [OpenClaw](https://github.com/openclaw/openclaw) - オープンソース自律型AIアシスタント

## 免責事項

本プロジェクトは Anthropic とは無関係です。ご利用は自己責任でお願いします。

## ライセンス

MIT
