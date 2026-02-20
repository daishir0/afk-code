---
name: blucli
description: Bluetooth control on macOS via blueutil CLI. List devices, connect, disconnect, toggle power, and manage pairings.
---

# Bluetooth Control (macOS)

Manage Bluetooth devices and settings using `blueutil` command-line tool.

## Prerequisites

- macOS
- `blueutil` installed via Homebrew: `brew install blueutil`

## Verify Installation

```bash
which blueutil && blueutil --version
```

If not installed:
```bash
brew install blueutil
```

## Operations

### 1. Bluetooth Power Management

**Check power status:**
```bash
blueutil --power
```
Returns `1` (on) or `0` (off).

**Turn Bluetooth on:**
```bash
blueutil --power 1
```

**Turn Bluetooth off:**
```bash
blueutil --power 0
```

**Toggle Bluetooth:**
```bash
blueutil --power toggle
```

### 2. Discoverability

**Check discoverable status:**
```bash
blueutil --discoverable
```

**Set discoverable on/off:**
```bash
blueutil --discoverable 1
blueutil --discoverable 0
```

### 3. List Devices

**List paired devices:**
```bash
blueutil --paired
```

Output format: `address = XX-XX-XX-XX-XX-XX, name = "Device Name", paired = 1, connected = 0`

**List connected devices:**
```bash
blueutil --connected
```

**List recently used devices:**
```bash
blueutil --recent
```

### 4. Device Connection

**Connect to a device:**
```bash
blueutil --connect DEVICE_ADDRESS
```

**Disconnect from a device:**
```bash
blueutil --disconnect DEVICE_ADDRESS
```

Device address format: `XX-XX-XX-XX-XX-XX` or `XX:XX:XX:XX:XX:XX`

**Connect with timeout (wait for connection):**
```bash
blueutil --connect DEVICE_ADDRESS --wait-connect DEVICE_ADDRESS 5
```
The `5` is timeout in seconds.

**Disconnect with timeout:**
```bash
blueutil --disconnect DEVICE_ADDRESS --wait-disconnect DEVICE_ADDRESS 5
```

### 5. Pairing

**Pair with a device:**
```bash
blueutil --pair DEVICE_ADDRESS
```

**Unpair a device:**
```bash
blueutil --unpair DEVICE_ADDRESS
```

### 6. Device Information

**Check if a specific device is connected:**
```bash
blueutil --is-connected DEVICE_ADDRESS
```
Returns `1` (connected) or `0` (not connected).

**Check if a specific device is paired:**
```bash
blueutil --is-paired DEVICE_ADDRESS
```

**Get device name:**
```bash
blueutil --info DEVICE_ADDRESS
```

### 7. Search/Inquiry for Nearby Devices

**Discover nearby devices (inquiry scan):**
```bash
blueutil --inquiry 10
```
The `10` is the inquiry duration in seconds.

### 8. Useful Combinations

**List all paired devices with connection status:**
```bash
blueutil --paired --format json
```

**Connect to a device by name (find address first):**
```bash
# Step 1: Find the device address
blueutil --paired | grep -i "DEVICE_NAME"

# Step 2: Connect using the address from Step 1
blueutil --connect DEVICE_ADDRESS
```

**Reconnect a device (disconnect then connect):**
```bash
blueutil --disconnect DEVICE_ADDRESS && sleep 2 && blueutil --connect DEVICE_ADDRESS
```

## Output Formats

blueutil supports different output formats:

```bash
# Default format
blueutil --paired

# JSON format (useful for programmatic parsing)
blueutil --paired --format json

# JSON pretty-printed
blueutil --paired --format json-pretty
```

## Notes

- Device addresses are in the format `XX-XX-XX-XX-XX-XX` (dashes) or `XX:XX:XX:XX:XX:XX` (colons). Both formats are accepted.
- Some operations (like pairing) may require user interaction on the device being paired.
- Bluetooth must be powered on before connecting/discovering devices.
- AirPods and some devices may require being in pairing mode for initial pairing.
- The `--wait-connect` flag is useful for devices that take time to establish a connection.
