---
name: eightctl
description: 8sleep smart mattress control and monitoring. Use when the user asks to "set bed temperature", "check sleep data", "control 8sleep", "adjust mattress", or anything related to 8sleep Pod management.
allowed-tools: Bash
---

# 8sleep Smart Mattress Control (eightctl)

Control and monitor 8sleep Pod smart mattress via the 8sleep API.

## Trigger Phrases

- "ベッドの温度を設定して" / "マットレスの温度変えて"
- "睡眠データを見せて" / "Sleep data"
- "8sleepの設定を変更"
- "Set bed temperature to..."
- "Check my sleep score"
- "Turn on/off the bed"

## Prerequisites

### env.yaml Configuration

```yaml
# 8sleep credentials
eightsleep_email: your-email@example.com
eightsleep_password: YOUR_PASSWORD

# Optional: 8sleep API token (if already authenticated)
eightsleep_token: YOUR_TOKEN
eightsleep_user_id: YOUR_USER_ID
```

## Authentication

### Step 1: Login and Get Token

```bash
source ~/.claude/lib/load_env.sh

# Login to 8sleep API
curl -s -X POST "https://client-api.8slp.net/v1/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${EIGHTSLEEP_EMAIL}\", \"password\": \"${EIGHTSLEEP_PASSWORD}\"}" | python3 -m json.tool
```

Response contains:
- `session.token` - Bearer token for subsequent requests
- `session.userId` - User ID
- `session.expirationDate` - Token expiry

### Step 2: Get User Profile & Device Info

```bash
TOKEN="YOUR_SESSION_TOKEN"
USER_ID="YOUR_USER_ID"

# Get user profile (includes device/bed info)
curl -s "https://client-api.8slp.net/v1/users/${USER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool
```

Key fields:
- `user.devices[]` - List of connected devices
- `user.currentDevice.id` - Active device ID
- `user.currentDevice.side` - User's side ("left" or "right")

## Temperature Control

### Get Current Temperature Settings

```bash
DEVICE_ID="YOUR_DEVICE_ID"

curl -s "https://client-api.8slp.net/v1/devices/${DEVICE_ID}" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool
```

Key fields:
- `result.leftKelvin` / `result.rightKelvin` - Current temperature (in Kelvin offset)
- `result.leftTargetHeatingLevel` / `result.rightTargetHeatingLevel` - Target level (-100 to +100)
- `result.leftNowHeating` / `result.rightNowHeating` - Currently heating (boolean)

### Set Temperature

Temperature scale: -100 (coolest) to +100 (hottest), 0 = neutral

```bash
# Set left side temperature
curl -s -X PUT "https://client-api.8slp.net/v1/devices/${DEVICE_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"leftTargetHeatingLevel": 20}' | python3 -m json.tool

# Set right side temperature
curl -s -X PUT "https://client-api.8slp.net/v1/devices/${DEVICE_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"rightTargetHeatingLevel": -30}' | python3 -m json.tool
```

### Turn On/Off

```bash
# Turn on heating/cooling for left side
curl -s -X PUT "https://client-api.8slp.net/v1/devices/${DEVICE_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"leftHeatingDuration": 28800}' | python3 -m json.tool

# Turn off (set duration to 0)
curl -s -X PUT "https://client-api.8slp.net/v1/devices/${DEVICE_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"leftHeatingDuration": 0}' | python3 -m json.tool
```

## Sleep Tracking

### Get Sleep Data

```bash
# Get recent sleep intervals
curl -s "https://client-api.8slp.net/v1/users/${USER_ID}/intervals?from=YYYY-MM-DD&to=YYYY-MM-DD" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool

# Get trends
curl -s "https://client-api.8slp.net/v1/users/${USER_ID}/trends?tz=Asia/Tokyo&from=YYYY-MM-DD&to=YYYY-MM-DD" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool
```

Key sleep metrics:
- `intervals[].score` - Overall sleep score (0-100)
- `intervals[].timeseries.tnt` - Toss & turns data
- `intervals[].timeseries.tempRoomC` - Room temperature
- `intervals[].timeseries.tempBedC` - Bed temperature
- `intervals[].timeseries.heartRate` - Heart rate
- `intervals[].timeseries.respiratoryRate` - Breathing rate
- `intervals[].stages` - Sleep stages (awake, light, deep, REM)

## Alarm/Schedule

### Set Thermal Alarm

```bash
# Set alarm with gradual warming
curl -s -X PUT "https://client-api.8slp.net/v1/users/${USER_ID}/temperature-schedule" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "schedule": {
      "days": ["monday","tuesday","wednesday","thursday","friday"],
      "time": "06:30",
      "timezone": "Asia/Tokyo"
    },
    "temperature": {
      "type": "smart",
      "level": 50
    }
  }' | python3 -m json.tool
```

## Temperature Guide

| Level | Description | Use Case |
|-------|-------------|----------|
| -100 to -60 | Very cool | Hot sleepers, summer |
| -60 to -20 | Cool | Standard cooling |
| -20 to 0 | Slightly cool | Mild preference |
| 0 | Neutral | No heating/cooling |
| 0 to 20 | Slightly warm | Mild preference |
| 20 to 60 | Warm | Cold sleepers, winter |
| 60 to 100 | Very warm | Maximum warmth |

## Response Format

```
8sleep Pod Status:
  Device: [device_name]
  Left Side:  Temp Level: [level] | Heating: [on/off]
  Right Side: Temp Level: [level] | Heating: [on/off]

Last Night's Sleep (Left):
  Score: [score]/100
  Duration: [hours]h [minutes]m
  Deep Sleep: [percentage]%
  REM: [percentage]%
  Heart Rate: [avg] bpm
```

## Notes

- 8sleep API is unofficial/undocumented; endpoints may change
- Token expires periodically; re-authenticate when receiving 401
- Temperature changes take a few minutes to take effect
- Rate limit: Be conservative with API calls
- All platforms supported (Windows, Linux, Mac)
