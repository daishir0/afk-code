---
name: sonoscli
description: ユーザーが「Sonosで再生」「スピーカーの音量を変えて」「Sonosを一時停止」「スピーカーをグループ化して」などと指示した時に使用。Sonosスピーカーの制御をHTTP APIまたはSoCo（Python）で行うスキル
---

# Sonos CLI

Sonosスピーカーの再生制御・音量調整・グループ管理を行います。
LAN内のSonosデバイスを自動検出し、APIキー不要で操作できます。

## 前提条件

- Sonosスピーカーが同一LAN内に存在すること
- Python パッケージ: `soco`

### パッケージインストール

```bash
source ~/.claude/lib/load_env.sh
run_python -m pip install soco
```

## トリガーとなるフレーズ

- "Sonosで再生" / "Sonosを再生"
- "スピーカーの音量を上げて/下げて"
- "Sonosを一時停止" / "Sonosを停止"
- "スピーカーをグループ化して"
- "全部屋で同じ曲を流して"
- "Sonosのスピーカー一覧"

## 操作一覧

### 方法1: SoCo（Python）- 推奨

#### スピーカーの検出・一覧表示

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import soco
speakers = soco.discover()
if speakers:
    for sp in speakers:
        print(f'名前: {sp.player_name}')
        print(f'  IP: {sp.ip_address}')
        print(f'  音量: {sp.volume}')
        print(f'  再生状態: {sp.get_current_transport_info()[\"current_transport_state\"]}')
        info = sp.get_current_track_info()
        if info.get('title'):
            print(f'  再生中: {info[\"title\"]} - {info[\"artist\"]}')
        print()
else:
    print('Sonosスピーカーが見つかりませんでした')
"
```

#### 再生制御

```bash
source ~/.claude/lib/load_env.sh

# 再生
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
speaker.play()
print('再生開始')
"

# 一時停止
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
speaker.pause()
print('一時停止')
"

# 停止
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
speaker.stop()
print('停止')
"

# 次の曲
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
speaker.next()
print('次の曲へ')
"

# 前の曲
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
speaker.previous()
print('前の曲へ')
"
```

#### 音量制御

```bash
source ~/.claude/lib/load_env.sh

# 音量取得
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
print(f'現在の音量: {speaker.volume}')
"

# 音量設定（0-100）
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
speaker.volume = 30
print(f'音量を30に設定しました')
"

# ミュート ON/OFF
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
speaker.mute = True
print('ミュートしました')
"
```

#### 現在の再生情報

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
info = speaker.get_current_track_info()
print(f'タイトル: {info[\"title\"]}')
print(f'アーティスト: {info[\"artist\"]}')
print(f'アルバム: {info[\"album\"]}')
print(f'再生位置: {info[\"position\"]}')
print(f'長さ: {info[\"duration\"]}')
"
```

#### URIを指定して再生

```bash
source ~/.claude/lib/load_env.sh

# URLから再生（ラジオ、ストリーミング等）
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
speaker.play_uri('x-rincon-mp3radio://example.com/stream.mp3')
print('ストリーム再生開始')
"
```

### 方法2: グループ制御

#### グループ化（複数スピーカーで同期再生）

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import soco
living = soco.discovery.by_name('リビングルーム')
bedroom = soco.discovery.by_name('ベッドルーム')
living.join(bedroom)  # リビングルームをベッドルームのグループに参加
print('グループ化完了')
"
```

#### グループ解除

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import soco
speaker = soco.discovery.by_name('リビングルーム')
speaker.unjoin()
print('グループから離脱しました')
"
```

#### 全スピーカーをグループ化

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import soco
speakers = list(soco.discover())
if len(speakers) > 1:
    master = speakers[0]
    for sp in speakers[1:]:
        sp.join(master)
    print(f'全{len(speakers)}台を {master.player_name} のグループに統合しました')
else:
    print('グループ化するスピーカーが足りません')
"
```

### 方法3: IP直接指定

スピーカー名での検出がうまくいかない場合、IPアドレスで直接指定できます。

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import soco
speaker = soco.SoCo('192.168.1.100')
print(f'名前: {speaker.player_name}')
print(f'音量: {speaker.volume}')
speaker.play()
"
```

## 使用例

### ケース1: スピーカー一覧確認
```
ユーザー: "Sonosのスピーカーを一覧表示して"
Claude: soco.discover() で検出し、名前・IP・状態を表示
```

### ケース2: 音量調整
```
ユーザー: "リビングの音量を50にして"
Claude: soco.discovery.by_name() で取得し、volume = 50 を設定
```

### ケース3: 全部屋同期再生
```
ユーザー: "全部屋で同じ音楽を流して"
Claude: 全スピーカーを検出してグループ化 → play()
```

## 注意事項

- Sonosスピーカーと実行マシンが同一LAN上にある必要がある
- スピーカー名は日本語でも英語でも設定可能（Sonosアプリで設定した名前を使用）
- `soco.discover()` はUDPマルチキャストを使用するため、ファイアウォール設定によっては検出に失敗する場合がある
- 検出に失敗する場合はIPアドレス直接指定（`soco.SoCo('IP')`）を使用
- Sonos S1世代のスピーカーも対応
