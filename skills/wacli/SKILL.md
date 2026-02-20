---
name: wacli
description: WhatsApp CLI messaging via whatsapp-web.js or Baileys library. Use when the user asks to "send WhatsApp message", "check WhatsApp", "WA message", or anything related to WhatsApp communication.
allowed-tools: Bash
---

# WhatsApp CLI Messaging (wacli)

Send and receive WhatsApp messages from the command line using Node.js libraries.

## Trigger Phrases

- "WhatsAppでメッセージを送って"
- "WAメッセージ送信して"
- "Send WhatsApp to..."
- "Check WhatsApp messages"
- "WhatsAppに通知して"

## Prerequisites

### Option A: whatsapp-web.js (Recommended)

```bash
# Install in skill directory
cd ~/.claude/skills/wacli
npm init -y
npm install whatsapp-web.js qrcode-terminal
```

### Option B: Baileys (Lighter, Multi-device)

```bash
cd ~/.claude/skills/wacli
npm init -y
npm install @whiskeysockets/baileys qrcode-terminal pino
```

## Setup & Authentication

### First-time QR Code Login (whatsapp-web.js)

Create `~/.claude/skills/wacli/auth.js`:

```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Scan this QR code with WhatsApp on your phone');
});

client.on('ready', () => {
    console.log('WhatsApp client is ready!');
    console.log('Authentication saved. You can now use send/receive commands.');
    process.exit(0);
});

client.initialize();
```

Run authentication:
```bash
cd ~/.claude/skills/wacli && node auth.js
```

## Sending Messages

### Send Text Message

Create `~/.claude/skills/wacli/send.js`:

```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

const args = process.argv.slice(2);
const phoneNumber = args[0]; // Format: country_code + number (e.g., 81901234567)
const message = args.slice(1).join(' ');

if (!phoneNumber || !message) {
    console.error('Usage: node send.js <phone_number> <message>');
    process.exit(1);
}

client.on('ready', async () => {
    try {
        const chatId = phoneNumber + '@c.us';
        await client.sendMessage(chatId, message);
        console.log(`Message sent to ${phoneNumber}: ${message}`);
    } catch (err) {
        console.error('Error:', err.message);
    }
    process.exit(0);
});

client.initialize();
```

Usage:
```bash
cd ~/.claude/skills/wacli && node send.js "81901234567" "Hello from Claude!"
```

### Send to Group

```javascript
// Group chat IDs end with @g.us
// Find group ID first using list-groups command
const chatId = 'GROUP_ID@g.us';
await client.sendMessage(chatId, message);
```

### Send Media

```javascript
const { MessageMedia } = require('whatsapp-web.js');

// Send image
const media = MessageMedia.fromFilePath('/path/to/image.jpg');
await client.sendMessage(chatId, media, { caption: 'Image caption' });

// Send document
const doc = MessageMedia.fromFilePath('/path/to/document.pdf');
await client.sendMessage(chatId, doc);
```

## Receiving Messages

### Read Recent Messages

Create `~/.claude/skills/wacli/read.js`:

```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

const phoneNumber = process.argv[2];
const limit = parseInt(process.argv[3]) || 10;

client.on('ready', async () => {
    try {
        if (phoneNumber) {
            const chatId = phoneNumber + '@c.us';
            const chat = await client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit: limit });
            messages.forEach(msg => {
                const time = new Date(msg.timestamp * 1000).toLocaleString();
                const from = msg.fromMe ? 'Me' : msg.author || phoneNumber;
                console.log(`[${time}] ${from}: ${msg.body}`);
            });
        } else {
            // List all chats with unread messages
            const chats = await client.getChats();
            const unread = chats.filter(c => c.unreadCount > 0);
            unread.forEach(chat => {
                console.log(`${chat.name}: ${chat.unreadCount} unread`);
            });
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
    process.exit(0);
});

client.initialize();
```

Usage:
```bash
# List unread chats
cd ~/.claude/skills/wacli && node read.js

# Read messages from specific contact
cd ~/.claude/skills/wacli && node read.js "81901234567" 20
```

## Command Reference

| Command | Description |
|---------|-------------|
| `node auth.js` | First-time QR authentication |
| `node send.js <phone> <msg>` | Send text message |
| `node read.js` | List unread chats |
| `node read.js <phone> [limit]` | Read messages from contact |

## Phone Number Format

- Japan: `81` + number without leading 0 (e.g., `81901234567`)
- US: `1` + number (e.g., `12025551234`)
- UK: `44` + number (e.g., `447911123456`)

## Notes

- First run requires QR code scan from phone (interactive terminal needed)
- Authentication persists in `.wwebjs_auth/` directory
- whatsapp-web.js requires Chromium/Puppeteer; may need additional system libraries
- Baileys is lighter but more complex to set up
- WhatsApp Business API is the official route for production use
- Session may expire if phone is offline for extended periods
- Rate limits apply; avoid bulk messaging
- All platforms supported (Windows, Linux, Mac) with Node.js installed
