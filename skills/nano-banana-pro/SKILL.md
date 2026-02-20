---
name: nano-banana-pro
description: Banana Pro / LeMaker single-board computer control via SSH and GPIO. Use when the user asks to "control Banana Pro", "GPIO", "hardware board", "toggle pin", or needs to interact with Banana Pro / similar SBC hardware.
allowed-tools: Bash
---

# Banana Pro / SBC Hardware Control (nano-banana-pro)

Control Banana Pro (LeMaker) and similar single-board computers via SSH, GPIO, and system commands.

## Trigger Phrases

- "Banana Proを操作して"
- "GPIOピンを制御して"
- "ハードウェアボードの状態確認"
- "Control Banana Pro"
- "Toggle GPIO pin..."
- "Check board status"

## Prerequisites

### env.yaml Configuration

```yaml
# Banana Pro SSH settings
banana_pro_host: 192.168.1.100
banana_pro_user: root
banana_pro_port: 22
# Optional: SSH key path (default: ~/.ssh/id_rsa)
banana_pro_ssh_key: ~/.ssh/banana_pro_key
```

## SSH Connection

### Basic Connection

```bash
source ~/.claude/lib/load_env.sh

# Connect to Banana Pro
ssh -i ${BANANA_PRO_SSH_KEY:-~/.ssh/id_rsa} \
    -p ${BANANA_PRO_PORT:-22} \
    ${BANANA_PRO_USER:-root}@${BANANA_PRO_HOST} "COMMAND_HERE"
```

### Helper Pattern

```bash
source ~/.claude/lib/load_env.sh
BP_SSH="ssh -i ${BANANA_PRO_SSH_KEY:-~/.ssh/id_rsa} -p ${BANANA_PRO_PORT:-22} ${BANANA_PRO_USER:-root}@${BANANA_PRO_HOST}"
```

## System Information

```bash
# Check system status
$BP_SSH "uname -a"

# CPU temperature
$BP_SSH "cat /sys/class/thermal/thermal_zone0/temp"

# Memory usage
$BP_SSH "free -h"

# Disk usage
$BP_SSH "df -h"

# CPU info
$BP_SSH "cat /proc/cpuinfo | head -20"

# Uptime
$BP_SSH "uptime"

# Network interfaces
$BP_SSH "ip addr show"

# Running processes
$BP_SSH "top -bn1 | head -20"
```

## GPIO Control

### Using WiringPi (Banana Pro)

Banana Pro uses WiringBP (a fork of WiringPi):

```bash
# List all GPIO pins and their states
$BP_SSH "gpio readall"

# Set pin mode (OUTPUT)
$BP_SSH "gpio mode 0 out"

# Set pin HIGH (turn on)
$BP_SSH "gpio write 0 1"

# Set pin LOW (turn off)
$BP_SSH "gpio write 0 0"

# Read pin value
$BP_SSH "gpio read 0"

# Set pin mode (INPUT with pull-up)
$BP_SSH "gpio mode 0 in"
$BP_SSH "gpio mode 0 up"

# PWM output (if supported)
$BP_SSH "gpio mode 1 pwm"
$BP_SSH "gpio pwm 1 512"
```

### Using sysfs GPIO (Universal)

```bash
# Export GPIO pin (e.g., pin 37 = GPIO37)
$BP_SSH "echo 37 > /sys/class/gpio/export"

# Set direction
$BP_SSH "echo out > /sys/class/gpio/gpio37/direction"

# Write value (HIGH)
$BP_SSH "echo 1 > /sys/class/gpio/gpio37/value"

# Write value (LOW)
$BP_SSH "echo 0 > /sys/class/gpio/gpio37/value"

# Read value
$BP_SSH "cat /sys/class/gpio/gpio37/value"

# Set as input
$BP_SSH "echo in > /sys/class/gpio/gpio37/direction"

# Unexport when done
$BP_SSH "echo 37 > /sys/class/gpio/unexport"
```

## I2C / SPI

### I2C

```bash
# Detect I2C devices
$BP_SSH "i2cdetect -y 0"
$BP_SSH "i2cdetect -y 1"

# Read I2C register
$BP_SSH "i2cget -y 1 0x48 0x00"

# Write I2C register
$BP_SSH "i2cset -y 1 0x48 0x01 0xFF"
```

### SPI

```bash
# Check SPI devices
$BP_SSH "ls /dev/spidev*"

# SPI test (requires spi-tools)
$BP_SSH "spi-pipe -d /dev/spidev0.0 -s 1000000 < /dev/zero | hexdump | head"
```

## Service Management

```bash
# List running services
$BP_SSH "systemctl list-units --type=service --state=running"

# Start/stop/restart a service
$BP_SSH "systemctl start SERVICE_NAME"
$BP_SSH "systemctl stop SERVICE_NAME"
$BP_SSH "systemctl restart SERVICE_NAME"

# Check service status
$BP_SSH "systemctl status SERVICE_NAME"

# View service logs
$BP_SSH "journalctl -u SERVICE_NAME --no-pager -n 50"
```

## File Transfer

```bash
# Copy file to Banana Pro
scp -i ${BANANA_PRO_SSH_KEY:-~/.ssh/id_rsa} \
    -P ${BANANA_PRO_PORT:-22} \
    /local/file.txt ${BANANA_PRO_USER}@${BANANA_PRO_HOST}:/remote/path/

# Copy file from Banana Pro
scp -i ${BANANA_PRO_SSH_KEY:-~/.ssh/id_rsa} \
    -P ${BANANA_PRO_PORT:-22} \
    ${BANANA_PRO_USER}@${BANANA_PRO_HOST}:/remote/file.txt ./outputs/
```

## Banana Pro GPIO Pin Map

| WiringBP | Physical | Name | BCM |
|----------|----------|------|-----|
| 0 | 11 | GPIO0 | 17 |
| 1 | 12 | GPIO1 | 18 |
| 2 | 13 | GPIO2 | 27 |
| 3 | 15 | GPIO3 | 22 |
| 4 | 16 | GPIO4 | 23 |
| 5 | 18 | GPIO5 | 24 |
| 6 | 22 | GPIO6 | 25 |
| 7 | 7 | GPIO7 | 4 |

(Full pin map depends on board revision. Run `gpio readall` for complete listing.)

## Response Format

```
Banana Pro Status:
  Host: [IP_ADDRESS]
  Uptime: [uptime]
  CPU Temp: [temp]C
  Memory: [used]/[total] ([percentage]%)
  Disk: [used]/[total] ([percentage]%)

GPIO Pin Status:
  Pin 0 (Physical 11): OUTPUT = HIGH
  Pin 1 (Physical 12): INPUT  = LOW
  Pin 2 (Physical 13): OUTPUT = LOW
```

## Notes

- Requires SSH access to the Banana Pro
- SSH key authentication recommended over password
- GPIO operations may require root access
- WiringBP must be installed on the Banana Pro for `gpio` commands
- sysfs GPIO works without additional libraries
- Be careful with GPIO operations to avoid hardware damage
- All platforms supported as SSH client (Windows, Linux, Mac)
