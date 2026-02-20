---
name: bluebubbles
description: BlueBubbles iMessage server API integration. Use when the user asks to "send iMessage", "check iMessages", "BlueBubbles", or needs to send/receive iMessages via HTTP API.
allowed-tools: Bash
---

# BlueBubbles iMessage Integration (bluebubbles)

Send and receive iMessages via the BlueBubbles server HTTP API.

## Trigger Phrases

- "iMessageを送って" / "iMessage送信"
- "メッセージを確認して" (iMessage context)
- "Send iMessage to..."
- "Check my iMessages"
- "BlueBubblesのメッセージ"

## Prerequisites

### BlueBubbles Server

BlueBubbles requires a Mac running the BlueBubbles server application.

1. Install BlueBubbles server on a Mac: https://bluebubbles.app
2. Configure the server and note the API URL and password
3. The server must be running for the API to work

### env.yaml Configuration

```yaml
# BlueBubbles server settings
bluebubbles_url: http://YOUR_SERVER_IP:1234
bluebubbles_password: YOUR_SERVER_PASSWORD
```

## Authentication

All requests require the `password` query parameter:

```bash
source ~/.claude/lib/load_env.sh
BB_URL="${BLUEBUBBLES_URL}"
BB_PASS="${BLUEBUBBLES_PASSWORD}"
```

## Sending Messages

### Send Text Message

```bash
source ~/.claude/lib/load_env.sh

# Send to phone number
curl -s -X POST "${BB_URL}/api/v1/message/text?password=${BB_PASS}" \
  -H "Content-Type: application/json" \
  -d '{
    "chatGuid": "iMessage;-;+1234567890",
    "message": "Hello from Claude!"
  }' | python3 -m json.tool

# Send to email (Apple ID)
curl -s -X POST "${BB_URL}/api/v1/message/text?password=${BB_PASS}" \
  -H "Content-Type: application/json" \
  -d '{
    "chatGuid": "iMessage;-;user@example.com",
    "message": "Hello from Claude!"
  }' | python3 -m json.tool
```

### Send Attachment

```bash
# Send image/file
curl -s -X POST "${BB_URL}/api/v1/message/attachment?password=${BB_PASS}" \
  -F "chatGuid=iMessage;-;+1234567890" \
  -F "message=Check this out!" \
  -F "attachment=@/path/to/file.jpg" | python3 -m json.tool
```

### Send Reaction (Tapback)

```bash
curl -s -X POST "${BB_URL}/api/v1/message/react?password=${BB_PASS}" \
  -H "Content-Type: application/json" \
  -d '{
    "chatGuid": "iMessage;-;+1234567890",
    "selectedMessageGuid": "MESSAGE_GUID",
    "reaction": "love"
  }' | python3 -m json.tool
```

Reaction types: `love`, `like`, `dislike`, `laugh`, `emphasize`, `question`

## Reading Messages

### Get Recent Messages

```bash
# Get last 25 messages
curl -s -X POST "${BB_URL}/api/v1/message/query?password=${BB_PASS}" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 25,
    "sort": "DESC",
    "with": ["chat", "attachment"]
  }' | python3 -m json.tool
```

### Get Messages from Specific Chat

```bash
# Get messages from a specific chat
curl -s "${BB_URL}/api/v1/chat/iMessage;-;+1234567890/message?password=${BB_PASS}&limit=20&sort=DESC" | python3 -m json.tool
```

### Search Messages

```bash
curl -s -X POST "${BB_URL}/api/v1/message/query?password=${BB_PASS}" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 20,
    "sort": "DESC",
    "where": [
      {"statement": "message.text LIKE :term", "args": {"term": "%search_term%"}}
    ]
  }' | python3 -m json.tool
```

## Chat Management

### List All Chats

```bash
curl -s -X POST "${BB_URL}/api/v1/chat/query?password=${BB_PASS}" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 25,
    "sort": "lastmessage",
    "with": ["lastMessage"]
  }' | python3 -m json.tool
```

### Get Specific Chat Info

```bash
curl -s "${BB_URL}/api/v1/chat/iMessage;-;+1234567890?password=${BB_PASS}" | python3 -m json.tool
```

### Mark Chat as Read

```bash
curl -s -X POST "${BB_URL}/api/v1/chat/iMessage;-;+1234567890/read?password=${BB_PASS}" | python3 -m json.tool
```

## Contact Management

### Search Contacts

```bash
curl -s -X POST "${BB_URL}/api/v1/contact/query?password=${BB_PASS}" \
  -H "Content-Type: application/json" \
  -d '{"term": "John"}' | python3 -m json.tool
```

### Get All Contacts

```bash
curl -s "${BB_URL}/api/v1/contact?password=${BB_PASS}" | python3 -m json.tool
```

## Server Status

```bash
# Check server info
curl -s "${BB_URL}/api/v1/server/info?password=${BB_PASS}" | python3 -m json.tool

# Check server statistics
curl -s "${BB_URL}/api/v1/server/statistics/totals?password=${BB_PASS}" | python3 -m json.tool
```

## Chat GUID Format

- **iMessage (phone)**: `iMessage;-;+1234567890`
- **iMessage (email)**: `iMessage;-;user@example.com`
- **SMS**: `SMS;-;+1234567890`
- **Group chat**: `iMessage;+;chat123456789`

## Response Format

When showing messages to the user:

```
iMessage Conversations:
  1. John Smith (+1234567890) - 3 unread
     Last: "See you tomorrow!" (2h ago)
  2. Work Group (5 members) - 1 unread
     Last: "Meeting at 3pm" (4h ago)

---
Messages with John Smith:
  [14:30] John: Hey, are you free tonight?
  [14:32] Me: Yes! What's up?
  [14:35] John: Let's grab dinner
```

## Notes

- Requires BlueBubbles server running on a Mac with macOS 11+
- Server must have iMessage configured and signed in
- SMS fallback available if configured in BlueBubbles settings
- Attachments must exist as local files accessible to Claude Code
- BlueBubbles API docs: https://documenter.getpostman.com/view/765844/UV5RnfwM
- All platforms can connect to the server via HTTP (the client runs anywhere)
