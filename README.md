# AFK Code

Monitor, interact with, and **autonomously run** Claude Code sessions from Telegram, Slack, or Discord. Built-in persistent memory, heartbeat-driven autonomous actions, and 50+ skills — inspired by [OpenClaw](https://github.com/openclaw/openclaw).

<img src="https://github.com/user-attachments/assets/83083b63-9ca2-4ef0-b83d-fcc51bd2fff9" alt="AFK Code iPhone Slack screenshot" width="400">

## Features

| Feature | Description |
|---------|-------------|
| **Remote Control** | Telegram/Slack/Discord からClaude Codeセッションを操作 |
| **Heartbeat** | 30分間隔で自律的にタスクを確認・実行 |
| **Cron Jobs** | crontab式でスケジュールタスクを定時実行 |
| **Persistent Memory** | SOUL.md / MEMORY.md / 日次ノートで長期記憶を維持 |
| **50+ Skills** | OpenClaw互換スキル群（天気、Apple連携、外部サービス等）|
| **Image Support** | 画像の自動検出・送信 |

## Quick Start

### 1. Install

```bash
npm install -g afk-code
```

Requires Node.js 18+.

### 2. Setup Telegram Bot

```bash
# BotFatherでボットを作成し、Bot TokenとChat IDを取得
afk-code telegram setup
```

### 3. Initialize Memory & Personality

```bash
afk-code init
```

以下のファイルが `~/.afk-code/` に作成されます:
- `SOUL.md` - AIのパーソナリティ定義
- `HEARTBEAT.md` - 定期チェックリスト
- `MEMORY.md` - 長期記憶
- `scheduler.yaml` - Heartbeat設定
- `cron.yaml` - Cronジョブ定義

### 4. Run

```bash
# Terminal 1: Telegram Bot + Heartbeat + Cron
afk-code telegram

# Terminal 2: Claude Code Session
afk-code run -- claude
```

Or use tmux shortcut (add `afk` function to `.zshrc`):
```bash
afk   # 一発でtmux起動
```

## Architecture

```
User ←→ Telegram ←→ afk-code ←→ Claude Code (PTY)
                        │
                  Scheduler
                  ├── Heartbeat (30min)
                  └── Cron (crontab)
```

1. `afk-code telegram` starts the bot + scheduler (Heartbeat & Cron)
2. `afk-code run -- claude` spawns Claude Code in a PTY
3. JSONL file watching relays messages bidirectionally
4. Heartbeat periodically sends check-in prompts to Claude Code
5. Claude Code reads HEARTBEAT.md and acts autonomously

## Heartbeat System

Heartbeatは、Claudeを「反応型」から「能動型」に変えるコア機能です。

### 仕組み

- 約30分間隔で Claude Code セッションに自動でチェックイン
- Claude Code が `~/.afk-code/HEARTBEAT.md` を読み、やるべきことを自律判断
- 結果は Telegram に自動報告

### 設定 (`~/.afk-code/scheduler.yaml`)

```yaml
heartbeat:
  enabled: true
  interval_minutes: 30
  quiet_hours:
    start: 23    # 23:00〜7:00は静粛（Heartbeatしない）
    end: 7
  max_consecutive_skips: 3
```

### HEARTBEAT.md のカスタマイズ

`~/.afk-code/HEARTBEAT.md` にチェック項目を追加・編集:

```markdown
## 毎回確認
- [ ] 今日の天気
- [ ] Apple Reminders に期限切れタスクがないか
- [ ] 日次ノートの作成/更新

## 条件付き
- [ ] MEMORY.mdが3日以上更新されていなければキュレーション
```

### Telegram コマンド

| コマンド | 説明 |
|---------|------|
| `/wakeup` | Heartbeatを即座に発火（手動トリガー）|
| `/heartbeat` | Heartbeatのステータス表示 |

## Cron System

正確な時刻指定でタスクをスケジュール実行します。

### 設定 (`~/.afk-code/cron.yaml`)

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

  - id: evening-summary
    name: 夕方のサマリー
    schedule: "0 18 * * 1-5"     # 平日18:00
    prompt: |
      今日の活動サマリーを作成:
      1. 完了タスク
      2. 明日への持ち越し
    enabled: true

  - id: weekly-review
    name: 週次レビュー
    schedule: "0 10 * * 0"       # 毎週日曜10:00
    prompt: |
      週次レビュー。MEMORY.mdを更新。
    enabled: true
```

### Cron式の書き方

```
┌──── 分 (0-59)
│ ┌── 時 (0-23)
│ │ ┌ 日 (1-31)
│ │ │ ┌ 月 (1-12)
│ │ │ │ ┌ 曜日 (0-7, 0=日曜)
│ │ │ │ │
* * * * *
```

例:
- `0 9 * * *` → 毎朝9:00
- `*/30 * * * *` → 30分ごと
- `0 9 * * 1-5` → 平日の朝9:00
- `0 10 * * 0` → 毎週日曜10:00

### Telegram コマンド

| コマンド | 説明 |
|---------|------|
| `/cron` | Cronジョブ一覧と次回実行時刻 |

## Persistent Memory

OpenClawのメモリシステムに対応する永続記憶機構です。

### ファイル構造

```
~/.afk-code/
├── SOUL.md          # パーソナリティ定義（人格・価値観）
├── HEARTBEAT.md     # Heartbeatチェックリスト
├── MEMORY.md        # 長期記憶（キュレーション済み）
├── scheduler.yaml   # Heartbeat設定
├── cron.yaml        # Cronジョブ定義
└── memory/          # 日次ノート
    ├── 2026-02-20.md
    ├── 2026-02-21.md
    └── ...
```

### 各ファイルの役割

| ファイル | 役割 |
|---------|------|
| `SOUL.md` | AIの「魂」。人格・振る舞い・価値観を定義 |
| `HEARTBEAT.md` | Heartbeat時のチェックリスト |
| `MEMORY.md` | 長期記憶。重要な記憶をキュレーション |
| `memory/YYYY-MM-DD.md` | 日次ノート。その日の活動ログ |

### Telegram コマンド

| コマンド | 説明 |
|---------|------|
| `/memory` | メモリファイルの概要表示 |
| `/soul` | SOUL.mdの内容を表示 |

## Skills (52 Skills)

OpenClaw互換の52スキルを搭載。Claude Codeのスキルシステム (`~/.claude/skills/`) として実装。

### Mac ネイティブ（APIキー不要）

| スキル | 説明 | 実装方式 |
|--------|------|---------|
| `apple-notes` | Apple Notes読み書き | AppleScript |
| `apple-reminders` | Apple Reminders管理 | AppleScript |
| `weather` | 天気情報取得 | wttr.in API |
| `healthcheck` | システムヘルスチェック | シェルコマンド |
| `camsnap` | カメラ撮影 | imagesnap |
| `peekaboo` | スクリーンショット | screencapture |
| `things-mac` | Things 3 タスク管理 | AppleScript |
| `bear-notes` | Bear ノート連携 | x-callback-url |
| `imsg` | iMessage送受信 | AppleScript |
| `blucli` | Bluetooth制御 | blueutil |
| `goplaces` | 地図・位置情報 | Web API |
| `voice-call` | 音声合成 | macOS say |

### 外部API連携（APIキー設定時に有効化）

| スキル | 説明 | 必要な設定 |
|--------|------|-----------|
| `openai-image-gen` | DALL-E画像生成 | `openai_api_key` |
| `openai-whisper-api` | 音声→テキスト(API) | `openai_api_key` |
| `openai-whisper` | 音声→テキスト(ローカル) | whisper.cpp |
| `sherpa-onnx-tts` | テキスト→音声 | sherpa-onnx |
| `gemini` | Gemini API | `gemini_api_key` |
| `notion` | Notion操作 | `notion_token` |
| `trello` | Trello操作 | `trello_key` + `trello_token` |
| `obsidian` | Obsidian連携 | Vault path |
| `spotify-player` | Spotify操作 | `spotify_client_id` |
| `sonoscli` | Sonos制御 | LAN内Sonosデバイス |
| `1password` | 1Password操作 | `op` CLI |
| `openhue` | Philips Hueライト | Hue Bridge IP |
| `himalaya` | メールCLI | IMAP設定 |
| `oracle` | Oracle DB | DB接続情報 |
| `food-order` | フードデリバリー | サービス依存 |

### ユーティリティ

| スキル | 説明 |
|--------|------|
| `gifgrep` | GIF検索 |
| `songsee` | 楽曲認識・歌詞検索 |
| `blogwatcher` | ブログ/RSS監視 |
| `eightctl` | 8sleep制御 |
| `wacli` | WhatsApp CLI |
| `bluebubbles` | BlueBubbles (iMessage代替) |
| `nano-banana-pro` | ハードウェアボード制御 |
| `ordercli` | 注文管理CLI |

### メタ・フレームワーク

| スキル | 説明 |
|--------|------|
| `clawhub` | スキルマーケットプレース |
| `mcporter` | MCPサーバー連携 |
| `sag` | サブエージェント実行 |
| `gog` | Google検索+要約 |

### 既存スキルでカバー済み

| OpenClawスキル | 対応する既存機能 |
|---------------|----------------|
| `slack` | slack-notify スキル |
| `discord` | afk-code内蔵 |
| `github` / `gh-issues` | gh CLI |
| `nano-pdf` | pdf スキル |
| `summarize` | Claude Code ネイティブ |
| `coding-agent` | Claude Code 自体 |
| `skill-creator` | skill-creator スキル |
| `session-logs` | afk-code SessionManager |
| `model-usage` | /model コマンド |
| `tmux` | .zshrcショートカット |
| `canvas` | web-artifacts-builder |
| `video-frames` | youtube スキル + ffmpeg |

### スキルにAPIキーを設定する方法

外部API連携スキルは `~/.claude/env.yaml` にAPIキーを追加:

```yaml
# ~/.claude/env.yaml に追記
openai_api_key: sk-...
gemini_api_key: AIza...
notion_token: ntn_...
trello_key: ...
trello_token: ...
spotify_client_id: ...
spotify_client_secret: ...
```

各スキルの `SKILL.md` に必要な設定項目が記載されています。

## CLI Commands

```
afk-code telegram setup     Telegram認証設定
afk-code telegram           Telegramボット起動（Heartbeat/Cron含む）
afk-code discord setup      Discord認証設定
afk-code discord            Discordボット起動
afk-code slack setup        Slack認証設定
afk-code slack              Slackボット起動
afk-code run -- <command>   監視付きセッション起動
afk-code init               メモリ・設定ファイル初期化
afk-code heartbeat status   Heartbeatステータス表示
afk-code cron list          Cronジョブ一覧
afk-code memory status      メモリステータス
afk-code memory list        日次ノート一覧
afk-code memory today       今日の日次ノート表示
afk-code status             全体ステータス表示
afk-code help               ヘルプ表示
```

## Telegram Commands

| コマンド | 説明 |
|---------|------|
| `/sessions` | アクティブセッション一覧 |
| `/switch <name>` | セッション切り替え |
| `/model <name>` | モデル切り替え (opus/sonnet/haiku) |
| `/compact` | 会話をコンパクト化 |
| `/background` | Ctrl+B送信 |
| `/interrupt` | Escape送信 |
| `/mode` | Shift+Tab送信 |
| `/heartbeat` | Heartbeatステータス表示 |
| `/wakeup` | Heartbeat手動トリガー |
| `/cron` | Cronジョブ一覧 |
| `/memory` | メモリ概要表示 |
| `/soul` | SOUL.md内容表示 |
| `/help` | コマンド一覧 |

## Client Comparison

| | Telegram | Discord | Slack |
|---|---|---|---|
| Siri integration | Receive & Send | Receive only | Receive only |
| Multi-session | Switchable | Yes | Yes |
| Heartbeat/Cron | Yes | Planned | Planned |
| Permissions | Personal | Personal | Admin |
| Image support | Yes | Yes | Yes |

## Configuration Files

| File | Location | Description |
|------|----------|-------------|
| `telegram.env` | `~/.afk-code/` | Telegram Bot Token & Chat ID |
| `scheduler.yaml` | `~/.afk-code/` | Heartbeat間隔・静粛時間 |
| `cron.yaml` | `~/.afk-code/` | Cronジョブ定義 |
| `SOUL.md` | `~/.afk-code/` | パーソナリティ定義 |
| `HEARTBEAT.md` | `~/.afk-code/` | 定期チェックリスト |
| `MEMORY.md` | `~/.afk-code/` | 長期記憶 |
| `env.yaml` | `~/.claude/` | APIキー・環境設定 |

## How It Works

1. `afk-code telegram` starts the Telegram bot, Heartbeat engine, and Cron scheduler
2. `afk-code run -- claude` spawns Claude Code in a PTY and connects via Unix socket
3. The bot watches Claude's JSONL files and relays messages to Telegram
4. Messages from Telegram are forwarded to Claude Code
5. Heartbeat sends periodic check-in prompts to Claude Code
6. Cron sends scheduled task prompts at specified times
7. Claude Code reads SOUL.md, HEARTBEAT.md, MEMORY.md for personality and context
8. Claude Code maintains daily notes in `memory/` for continuity

## tmux Shortcut

Add to `~/.zshrc`:

```bash
afk() {
    source ~/.nvm/nvm.sh
    if tmux has-session -t afk-bot 2>/dev/null; then
        echo "afk-bot は既に起動中です。 tmux attach -t afk-bot で確認できます"
        return 0
    fi
    tmux new-session -d -s afk-bot 'source ~/.nvm/nvm.sh && afk-code telegram'
    sleep 2
    tmux split-window -t afk-bot "cd ~ && source ~/.nvm/nvm.sh && afk-code run -- claude --dangerously-skip-permissions"
    echo "afk 起動完了！ Telegramからメッセージを送れます"
    echo "Heartbeat: 30分間隔で自律チェック稼働中"
    echo "確認: tmux attach -t afk-bot"
}
```

## Limitations

- Heartbeat/Cron は現在 Telegram のみ対応（Discord/Slack は将来対応）
- Claude Code セッションが起動していない場合、Heartbeat/Cronはスキップされる
- Plan mode の自動回答は非対応（`/mode` コマンドで回避可）

## Inspired By

- [OpenClaw](https://github.com/openclaw/openclaw) - Open-source autonomous AI assistant

## Disclaimer

This project is not affiliated with Anthropic. Use at your own risk.

## License

MIT
