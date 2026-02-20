---
name: healthcheck
description: macOSのシステムヘルスチェック（CPU、メモリ、ディスク、稼働時間）をシェルコマンドで実行するスキル
---

# Healthcheck スキル

macOSのシステム状態をシェルコマンドで確認します。CPU使用率、メモリ使用量、ディスク使用量、稼働時間などを取得します。

## 前提条件

- macOS環境であること
- 標準搭載のコマンドのみ使用（追加インストール不要）

## 操作一覧

### 1. 総合ヘルスチェック（一括実行）

以下のコマンドをまとめて実行することで、システム全体の状態を把握できます。

```bash
echo "=== System Health Check ==="
echo ""
echo "--- OS Info ---"
sw_vers
echo ""
echo "--- Uptime ---"
uptime
echo ""
echo "--- CPU Info ---"
sysctl -n machdep.cpu.brand_string
sysctl -n hw.ncpu
echo ""
echo "--- Memory ---"
sysctl -n hw.memsize | awk '{printf "Total: %.1f GB\n", $1/1024/1024/1024}'
vm_stat | head -10
echo ""
echo "--- Disk Usage ---"
df -h /
echo ""
echo "--- Top Processes (CPU) ---"
ps aux --sort=-%cpu | head -6
echo ""
echo "--- Top Processes (Memory) ---"
ps aux --sort=-%mem | head -6
```

### 2. 個別チェック項目

#### CPU情報

```bash
# CPUモデル名
sysctl -n machdep.cpu.brand_string

# CPUコア数
sysctl -n hw.ncpu

# 論理プロセッサ数
sysctl -n hw.logicalcpu

# 物理コア数
sysctl -n hw.physicalcpu

# CPU使用率の概要（top を1回だけ実行）
top -l 1 -n 0 | grep "CPU usage"
```

#### メモリ情報

```bash
# 物理メモリ総量
sysctl -n hw.memsize | awk '{printf "Total Memory: %.1f GB\n", $1/1024/1024/1024}'

# メモリ使用状況（vm_stat）
vm_stat

# メモリプレッシャー確認
memory_pressure
```

vm_stat の出力からメモリ使用率を計算する場合:

```bash
vm_stat | awk '
/Pages free/ {free=$3}
/Pages active/ {active=$3}
/Pages inactive/ {inactive=$3}
/Pages speculative/ {spec=$3}
/Pages wired/ {wired=$3}
END {
    gsub(/\./, "", free); gsub(/\./, "", active); gsub(/\./, "", inactive); gsub(/\./, "", spec); gsub(/\./, "", wired);
    total = free + active + inactive + spec + wired;
    used = active + wired;
    printf "Used: %.1f%%\n", (used/total)*100;
    printf "Free: %.1f%%\n", (free/total)*100;
}'
```

#### ディスク使用量

```bash
# メインディスク
df -h /

# 全ディスク
df -h

# ディスク使用率のみ
df -h / | awk 'NR==2 {print "Disk Usage: " $5 " (" $3 " used of " $2 ")"}'
```

#### システム稼働時間

```bash
uptime
```

#### ネットワーク状態

```bash
# ネットワークインターフェース情報
ifconfig | grep -E "^[a-z]|inet "

# デフォルトゲートウェイ
netstat -rn | grep default

# DNS設定
scutil --dns | head -20

# インターネット接続確認
curl -s --max-time 5 -o /dev/null -w "%{http_code}" https://www.google.com && echo " - Internet OK" || echo " - Internet NG"
```

#### バッテリー状態（ノートPCのみ）

```bash
pmset -g batt
```

#### ロードアベレージ

```bash
sysctl -n vm.loadavg
```

### 3. 警告判定付きヘルスチェック

ディスクやメモリの使用率が閾値を超えた場合に警告を表示:

```bash
echo "=== Health Check with Alerts ==="

# ディスク使用率チェック（80%以上で警告）
DISK_USAGE=$(df -h / | awk 'NR==2 {gsub(/%/,""); print $5}')
if [ "$DISK_USAGE" -ge 80 ]; then
    echo "[WARNING] Disk usage is ${DISK_USAGE}%"
else
    echo "[OK] Disk usage is ${DISK_USAGE}%"
fi

# ロードアベレージチェック（CPUコア数を超えたら警告）
CORES=$(sysctl -n hw.ncpu)
LOAD=$(sysctl -n vm.loadavg | awk '{print $2}')
LOAD_INT=$(echo "$LOAD" | awk '{printf "%d", $1}')
if [ "$LOAD_INT" -ge "$CORES" ]; then
    echo "[WARNING] Load average ${LOAD} exceeds CPU cores (${CORES})"
else
    echo "[OK] Load average ${LOAD} within limits (${CORES} cores)"
fi

# メモリプレッシャーチェック
MEM_PRESSURE=$(memory_pressure 2>/dev/null | tail -1)
echo "[INFO] Memory: $MEM_PRESSURE"
```

## 注意事項

- `top -l 1` は一回分のスナップショットのみ取得（リアルタイムモードではない）
- `vm_stat` の出力はページ単位（1ページ = 通常16384バイト、Apple Silicon/4096バイト、Intel）
- `memory_pressure` コマンドは管理者権限が不要だが、実行に数秒かかる場合がある
- バッテリー情報はデスクトップMacでは「No batteries」と表示される
