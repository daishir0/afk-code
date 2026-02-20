---
name: openhue
description: ユーザーが「ライトをつけて」「電気を消して」「明るさを変えて」「ライトの色を変えて」「シーンを設定して」などと指示した時に使用。Philips Hue Bridge APIを使用したスマートライト制御スキル
---

# OpenHue - Philips Hue ライト制御

Philips Hue Bridge のREST APIを使用して、スマートライトの制御（ON/OFF、明るさ、色、シーン）を行います。

## 前提条件

- Philips Hue Bridge が同一LAN内に存在すること
- Hue Bridge のユーザー名（APIキー）を取得済みであること
- `~/.claude/env.yaml` に以下を設定：

```yaml
hue_bridge_ip: 192.168.1.XXX
hue_username: YOUR_HUE_API_USERNAME
```

### ユーザー名（APIキー）の取得方法

1. Hue Bridge の物理ボタンを押す
2. 30秒以内に以下を実行:

```bash
curl -X POST "http://HUE_BRIDGE_IP/api" \
  -H "Content-Type: application/json" \
  -d '{"devicetype":"claude_code#user"}'
```

3. レスポンスの `username` フィールドの値を `env.yaml` の `hue_username` に設定

## トリガーとなるフレーズ

- "ライトをつけて" / "電気をつけて"
- "ライトを消して" / "電気を消して"
- "明るさを〇〇にして"
- "色を〇〇にして"
- "暖かい色にして" / "クールな色にして"
- "シーンを〇〇にして"
- "全部の部屋のライトを消して"

## 操作一覧

### 1. ライト一覧の取得

```bash
curl -s "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights" | python3 -m json.tool
```

使いやすい形式で表示:

```bash
source ~/.claude/lib/load_env.sh
run_python -c "
import json, urllib.request, os
ip = os.environ.get('HUE_BRIDGE_IP', '')
user = os.environ.get('HUE_USERNAME', '')
url = f'http://{ip}/api/{user}/lights'
data = json.loads(urllib.request.urlopen(url).read())
for lid, info in data.items():
    state = info['state']
    status = 'ON' if state['on'] else 'OFF'
    bri = state.get('bri', 'N/A')
    print(f'ID: {lid} | 名前: {info[\"name\"]} | 状態: {status} | 明るさ: {bri}/254')
"
```

### 2. ライトのON/OFF

```bash
# ライトをON（ID指定）
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true}'

# ライトをOFF
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": false}'
```

### 3. 明るさの調整

```bash
# 明るさ設定（1-254, 254が最大）
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true, "bri": 127}'

# 明るさ50%の場合: bri = 127
# 明るさ100%の場合: bri = 254
# 明るさ25%の場合: bri = 64
```

### 4. 色温度の変更

```bash
# 暖かい白（2000K相当）: ct = 500
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true, "ct": 500}'

# 昼白色（4000K相当）: ct = 250
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true, "ct": 250}'

# クール白（6500K相当）: ct = 153
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true, "ct": 153}'
```

色温度の目安:
- ct=500: 暖色系（電球色、リラックス）
- ct=370: 暖白色
- ct=250: 昼白色（ニュートラル）
- ct=200: 昼光色
- ct=153: 寒色系（クール、集中）

### 5. カラー設定（HSB）

```bash
# 赤色
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true, "hue": 0, "sat": 254, "bri": 254}'

# 青色
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true, "hue": 46920, "sat": 254, "bri": 254}'

# 緑色
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true, "hue": 25500, "sat": 254, "bri": 254}'

# オレンジ色
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true, "hue": 5000, "sat": 254, "bri": 254}'

# 紫色
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": true, "hue": 50000, "sat": 254, "bri": 254}'
```

hue値の目安（0-65535）:
- 0: 赤
- 5000: オレンジ
- 12750: 黄
- 25500: 緑
- 36210: 水色
- 46920: 青
- 50000: 紫
- 56100: ピンク

### 6. グループ（部屋）の制御

```bash
# グループ一覧
curl -s "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/groups" | python3 -m json.tool

# グループ全体をON
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/groups/1/action" \
  -H "Content-Type: application/json" \
  -d '{"on": true}'

# グループ全体をOFF
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/groups/1/action" \
  -H "Content-Type: application/json" \
  -d '{"on": false}'

# 全ライトOFF（グループ0 = 全ライト）
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/groups/0/action" \
  -H "Content-Type: application/json" \
  -d '{"on": false}'
```

### 7. シーンの制御

```bash
# シーン一覧
curl -s "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/scenes" | python3 -m json.tool

# シーンを適用
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/groups/1/action" \
  -H "Content-Type: application/json" \
  -d '{"scene": "SCENE_ID"}'
```

### 8. トランジション（ゆっくり変化）

```bash
# 5秒かけてゆっくりOFF（transitiontime = 50 = 5秒、単位は100ms）
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"on": false, "transitiontime": 50}'

# 10秒かけて暖色に変更
curl -s -X PUT "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/1/state" \
  -H "Content-Type: application/json" \
  -d '{"ct": 500, "bri": 100, "transitiontime": 100}'
```

## 環境変数の読み込み

curlコマンドで環境変数を使用する場合:

```bash
source ~/.claude/lib/load_env.sh

# 変数展開してcurlを実行
curl -s "http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights"
```

## env.yaml 設定例

```yaml
# Philips Hue設定
hue_bridge_ip: 192.168.1.100
hue_username: YOUR_HUE_API_USERNAME_STRING
```

## 使用例

### ケース1: ライトを全部消す
```
ユーザー: "全部のライトを消して"
Claude: groups/0/action に {"on": false} を送信
```

### ケース2: 明るさ調整
```
ユーザー: "リビングのライトを50%にして"
Claude: ライト一覧で名前確認 → bri=127 でPUT
```

### ケース3: リラックスモード
```
ユーザー: "リラックスできる雰囲気にして"
Claude: 暖色(ct=500) + 明るさ控えめ(bri=100) + トランジション(5秒) で設定
```

## 注意事項

- Hue BridgeとClaude実行マシンが同一LAN上にある必要がある
- APIユーザー名は一度生成すればずっと使用可能
- hue値はカラーLED対応の電球（Hue Color, Hue Go等）のみで使用可能
- White Ambiance（色温度のみ対応）モデルではctパラメータのみ使用可能
- White（調光のみ）モデルではbriパラメータのみ使用可能
- Hue Bridge APIはHTTP（非HTTPS）であるため、LAN外からのアクセスは推奨しない
