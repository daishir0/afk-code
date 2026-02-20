---
name: bear-notes
description: Bear notes app integration on macOS via x-callback-url. Create, search, open, and manage notes in Bear.
---

# Bear Notes Integration (macOS)

Manage notes in Bear app using the x-callback-url scheme.

## Prerequisites

- macOS with Bear app installed
- Bear must be running or will be launched automatically

## Operations

### 1. Create a Note

```bash
open "bear://x-callback-url/create?title=NOTE_TITLE&text=NOTE_BODY&tags=TAG1,TAG2"
```

Parameters:
- `title`: Note title
- `text`: Note body (supports Markdown, URL-encoded)
- `tags`: Comma-separated tags
- `pin`: `yes` to pin the note
- `open_note`: `yes` (default) or `no` to prevent opening the note
- `new_window`: `yes` to open in a new window
- `float`: `yes` to make the window float
- `timestamp`: `yes` to prepend the current date and time

### 2. Add Text to an Existing Note

```bash
open "bear://x-callback-url/add-text?id=NOTE_ID&text=ADDITIONAL_TEXT&mode=append"
```

Parameters:
- `id`: Note unique identifier (get from search or open)
- `title`: Note title (alternative to id)
- `text`: Text to add (URL-encoded)
- `mode`: `prepend`, `append`, or `replace_all`
- `header`: Header name to append text after
- `new_line`: `no` to avoid adding a newline before text
- `tags`: Comma-separated tags to add
- `timestamp`: `yes` to prepend date and time

### 3. Search Notes

```bash
open "bear://x-callback-url/search?term=SEARCH_TERM&tag=TAG_NAME"
```

Parameters:
- `term`: Search term (URL-encoded)
- `tag`: Tag to filter by (URL-encoded)
- `show_window`: `yes` to show Bear window

### 4. Open a Specific Note

```bash
open "bear://x-callback-url/open-note?id=NOTE_ID"
open "bear://x-callback-url/open-note?title=NOTE_TITLE"
```

Parameters:
- `id`: Note unique identifier
- `title`: Note title (alternative to id)
- `header`: Header within the note to scroll to
- `new_window`: `yes` to open in a new window
- `float`: `yes` to make the window float
- `show_window`: `yes` to show Bear window
- `edit`: `yes` to place cursor at the end of the note

### 5. Get Note Content (via AppleScript for programmatic access)

Bear's x-callback-url does not return content directly in the terminal. Use AppleScript with the URL scheme's x-success callback, or use the Bear SQLite database for read operations:

```bash
# Search Bear's database directly (read-only)
BEAR_DB="$HOME/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/database.sqlite"
sqlite3 "$BEAR_DB" "SELECT ZTITLE, ZTEXT FROM ZSFNOTE WHERE ZTRASHED = 0 AND ZTITLE LIKE '%SEARCH_TERM%' LIMIT 10;"
```

**Note**: The database path may vary. This is read-only access; never modify the database directly.

### 6. Trash a Note

```bash
open "bear://x-callback-url/trash?id=NOTE_ID"
open "bear://x-callback-url/trash?title=NOTE_TITLE"
```

### 7. Create a Tag

Tags are created automatically when included in a note. Use `#tag-name` in note text or the `tags` parameter.

### 8. Archive a Note

```bash
open "bear://x-callback-url/archive?id=NOTE_ID"
```

### 9. Open Bear Tag View

```bash
open "bear://x-callback-url/open-tag?name=TAG_NAME"
```

## URL Encoding

Always URL-encode special characters in parameters:

```bash
# Encode a string for use in Bear URLs
python3 -c "import urllib.parse; print(urllib.parse.quote('My note with special chars & symbols'))"
```

Common encodings:
- Space: `%20`
- Newline: `%0A`
- Hash (`#`): `%23`
- Ampersand (`&`): `%26`

## Markdown Support

Bear supports Markdown in note body. Use standard Markdown syntax:
- `# Heading 1`, `## Heading 2`
- `- list item`, `1. numbered item`
- `**bold**`, `*italic*`
- `[link text](url)`
- `` `code` ``, ` ``` code block ``` `
- `- [ ] todo item`, `- [x] completed todo`

## Notes

- Bear x-callback-url documentation: https://bear.app/faq/x-callback-url-scheme-documentation/
- Some operations (like `open_note`) may return a note identifier in the x-success callback; this works in apps but not directly in terminal.
- For bulk programmatic read operations, the SQLite database approach is more reliable.
- The database approach is read-only. Always use the URL scheme for write operations.
