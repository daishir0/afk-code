---
name: imsg
description: iMessage send and read via AppleScript on macOS. Send messages and read recent conversations using Messages.app.
---

# iMessage Integration (macOS)

Send and read iMessage/SMS messages using AppleScript and the Messages app.

## Prerequisites

- macOS with Messages.app configured and signed into iMessage
- AppleScript automation permissions: System Settings > Privacy & Security > Automation > Allow Messages.app

## Operations

### 1. Send a Message

**To a phone number:**

```bash
osascript -e '
tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant targetService buddy "PHONE_NUMBER"
    send "MESSAGE_TEXT" to targetBuddy
end tell
'
```

Replace `PHONE_NUMBER` with the full phone number (e.g., `+81XXXXXXXXXX` or `+1XXXXXXXXXX`).

**To an email address (iMessage):**

```bash
osascript -e '
tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant targetService buddy "EMAIL@EXAMPLE.COM"
    send "MESSAGE_TEXT" to targetBuddy
end tell
'
```

**Alternative method using buddy:**

```bash
osascript -e '
tell application "Messages"
    set targetBuddy to buddy "PHONE_OR_EMAIL" of (1st account whose service type = iMessage)
    send "MESSAGE_TEXT" to targetBuddy
end tell
'
```

### 2. Send a Multiline Message

For multiline messages, use a file-based approach:

```bash
# Step 1: Write the message to a temp file (use Write tool)
# Content of /tmp/imsg_body.txt:
# Line 1
# Line 2
# Line 3

# Step 2: Send the message
osascript <<'APPLESCRIPT'
set msgText to do shell script "cat /tmp/imsg_body.txt"
tell application "Messages"
    set targetBuddy to buddy "PHONE_OR_EMAIL" of (1st account whose service type = iMessage)
    send msgText to targetBuddy
end tell
APPLESCRIPT

# Step 3: Clean up
rm /tmp/imsg_body.txt
```

### 3. Read Recent Messages

Read messages from the Messages SQLite database (read-only):

```bash
sqlite3 "$HOME/Library/Messages/chat.db" "
SELECT
    datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as timestamp,
    CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE coalesce(h.id, 'Unknown') END as sender,
    m.text
FROM message m
LEFT JOIN handle h ON m.handle_id = h.ROWID
WHERE m.text IS NOT NULL
ORDER BY m.date DESC
LIMIT 20;
"
```

### 4. Read Messages from a Specific Contact

```bash
sqlite3 "$HOME/Library/Messages/chat.db" "
SELECT
    datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as timestamp,
    CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE h.id END as sender,
    m.text
FROM message m
LEFT JOIN handle h ON m.handle_id = h.ROWID
WHERE h.id = 'PHONE_OR_EMAIL'
    AND m.text IS NOT NULL
ORDER BY m.date DESC
LIMIT 20;
"
```

### 5. List Recent Conversations

```bash
sqlite3 "$HOME/Library/Messages/chat.db" "
SELECT
    h.id as contact,
    datetime(MAX(m.date)/1000000000 + 978307200, 'unixepoch', 'localtime') as last_message,
    COUNT(*) as message_count
FROM message m
JOIN handle h ON m.handle_id = h.ROWID
WHERE m.text IS NOT NULL
GROUP BY h.id
ORDER BY MAX(m.date) DESC
LIMIT 20;
"
```

### 6. Search Messages by Content

```bash
sqlite3 "$HOME/Library/Messages/chat.db" "
SELECT
    datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as timestamp,
    CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE h.id END as sender,
    m.text
FROM message m
LEFT JOIN handle h ON m.handle_id = h.ROWID
WHERE m.text LIKE '%SEARCH_TERM%'
ORDER BY m.date DESC
LIMIT 20;
"
```

### 7. Get Unread Message Count (approximate)

```bash
sqlite3 "$HOME/Library/Messages/chat.db" "
SELECT COUNT(*)
FROM message m
WHERE m.is_read = 0
    AND m.is_from_me = 0
    AND m.text IS NOT NULL;
"
```

## Permissions

- **Full Disk Access** may be required to read the Messages database: System Settings > Privacy & Security > Full Disk Access
- **Automation** permission is required for sending: System Settings > Privacy & Security > Automation

## Important Notes

- The Messages database path is `$HOME/Library/Messages/chat.db`. This database is read-only for our purposes. Never modify it directly.
- The date calculation (`date/1000000000 + 978307200`) converts Apple's Core Data timestamp (nanoseconds since 2001-01-01) to Unix epoch.
- Phone numbers should include the country code (e.g., `+81` for Japan, `+1` for US).
- Sending messages via AppleScript will activate Messages.app briefly.
- Group messages have different handling; the above examples are for individual conversations.
- On newer macOS versions, additional security prompts may appear when first running these commands.
