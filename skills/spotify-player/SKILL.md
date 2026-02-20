---
name: spotify-player
description: ユーザーが「音楽をかけて」「Spotifyで再生」「今の曲は？」「次の曲」「一時停止」などと指示した時に使用。Spotify Web APIとAppleScript（Mac）を組み合わせた音楽再生制御スキル
---

# Spotify Player

Spotify Web APIおよびAppleScript（macOS）を使用して、音楽の再生制御・検索・情報取得を行います。

## 前提条件

- Spotifyアプリがインストールされていること
- Spotify Developer Dashboard でアプリを作成し、Client ID / Client Secret を取得済みであること
- `~/.claude/env.yaml` に以下を設定：

```yaml
spotify_client_id: YOUR_SPOTIFY_CLIENT_ID
spotify_client_secret: YOUR_SPOTIFY_CLIENT_SECRET
```

- Python パッケージ: `spotipy` (Spotify Web API用)

### パッケージインストール

```bash
source ~/.claude/lib/load_env.sh
run_python -m pip install spotipy
```

## トリガーとなるフレーズ

- "音楽をかけて" / "曲を再生して"
- "Spotifyで〇〇を再生"
- "一時停止" / "ポーズ"
- "次の曲" / "スキップ"
- "前の曲"
- "今の曲は？" / "今何聴いてる？"
- "〇〇を検索して"
- "音量を上げて/下げて"

## 操作一覧

### 方法1: AppleScript（macOS基本制御 - APIキー不要）

Spotifyアプリが起動していれば、AppleScriptで基本操作が可能です。

#### 再生/一時停止

```bash
# 再生
osascript -e 'tell application "Spotify" to play'

# 一時停止
osascript -e 'tell application "Spotify" to pause'

# 再生/一時停止トグル
osascript -e 'tell application "Spotify" to playpause'
```

#### 曲送り/曲戻し

```bash
# 次の曲
osascript -e 'tell application "Spotify" to next track'

# 前の曲
osascript -e 'tell application "Spotify" to previous track'
```

#### 現在の曲情報を取得

```bash
osascript -e '
tell application "Spotify"
    set trackName to name of current track
    set artistName to artist of current track
    set albumName to album of current track
    set trackDuration to duration of current track
    set playerPos to player position
    return "曲名: " & trackName & linefeed & "アーティスト: " & artistName & linefeed & "アルバム: " & albumName & linefeed & "長さ: " & (trackDuration / 1000) & "秒" & linefeed & "再生位置: " & (round playerPos) & "秒"
end tell
'
```

#### 音量制御

```bash
# 音量を取得（0-100）
osascript -e 'tell application "Spotify" to get sound volume'

# 音量を設定（0-100）
osascript -e 'tell application "Spotify" to set sound volume to 50'
```

#### 再生状態の確認

```bash
osascript -e 'tell application "Spotify" to get player state'
# → "playing", "paused", "stopped"
```

#### 特定のURI（トラック/プレイリスト/アルバム）を再生

```bash
# トラック再生
osascript -e 'tell application "Spotify" to play track "spotify:track:TRACK_ID"'

# プレイリスト再生
osascript -e 'tell application "Spotify" to play track "spotify:playlist:PLAYLIST_ID"'

# アルバム再生
osascript -e 'tell application "Spotify" to play track "spotify:album:ALBUM_ID"'
```

### 方法2: Spotify Web API（Python - 検索・高度な操作）

検索やプレイリスト管理など、高度な操作にはWeb APIを使用します。

#### 曲を検索して再生

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/spotify-player/spotify_search.py "検索キーワード"
```

`spotify_search.py` の実装例:

```python
import sys
import os
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

client_id = os.environ.get('SPOTIFY_CLIENT_ID')
client_secret = os.environ.get('SPOTIFY_CLIENT_SECRET')

sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
    client_id=client_id,
    client_secret=client_secret
))

query = sys.argv[1] if len(sys.argv) > 1 else ""
results = sp.search(q=query, limit=5, type='track')

for i, track in enumerate(results['tracks']['items']):
    print(f"{i+1}. {track['name']} - {track['artists'][0]['name']}")
    print(f"   URI: {track['uri']}")
    print(f"   Album: {track['album']['name']}")
    print()
```

#### 検索結果から再生

検索で得たURIを使ってAppleScriptで再生:

```bash
# 1. 検索
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/spotify-player/spotify_search.py "bohemian rhapsody"

# 2. 取得したURIで再生
osascript -e 'tell application "Spotify" to play track "spotify:track:XXXXXX"'
```

### 方法3: シャッフル・リピート制御

```bash
# シャッフルON
osascript -e 'tell application "Spotify" to set shuffling to true'

# シャッフルOFF
osascript -e 'tell application "Spotify" to set shuffling to false'

# リピートON
osascript -e 'tell application "Spotify" to set repeating to true'

# リピートOFF
osascript -e 'tell application "Spotify" to set repeating to false'
```

## env.yaml 設定例

```yaml
# Spotify API設定
spotify_client_id: YOUR_SPOTIFY_CLIENT_ID
spotify_client_secret: YOUR_SPOTIFY_CLIENT_SECRET
```

## 使用例

### ケース1: 基本再生制御
```
ユーザー: "音楽を一時停止して"
Claude: osascript -e 'tell application "Spotify" to pause'
```

### ケース2: 曲検索して再生
```
ユーザー: "QueenのBohemian Rhapsodyをかけて"
Claude:
  1. spotify_search.py で検索してURIを取得
  2. osascript で該当URIを再生
```

### ケース3: 今の曲を確認
```
ユーザー: "今何の曲？"
Claude: osascript で current track 情報を取得して返答
```

## 注意事項

- AppleScriptはmacOS専用。Linux/Windowsでは Spotify Web API + デバイス制御（Premium必要）を使用
- Web APIの検索機能はFreeプランでも利用可能
- Web APIでの再生制御（play/pause等）にはSpotify Premiumが必要
- AppleScriptによる制御はSpotifyアプリが起動している必要がある
- 初回のWeb API認証時にブラウザが開く場合がある（OAuth認証フロー）
