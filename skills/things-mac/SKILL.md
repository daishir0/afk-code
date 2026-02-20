---
name: things-mac
description: Things 3 task management on macOS via AppleScript and URL scheme. Create tasks, projects, search, and complete tasks.
---

# Things 3 Task Management (macOS)

Manage tasks and projects in Things 3 using AppleScript and the Things URL scheme.

## Prerequisites

- macOS with Things 3 installed
- Things 3 must be running or will be launched automatically

## Operations

### 1. Create a Task

**Via URL scheme (recommended for simple tasks):**

```bash
open "things:///add?title=TASK_TITLE&notes=TASK_NOTES&when=today&deadline=2026-03-01&tags=TAG1,TAG2&list=PROJECT_NAME"
```

URL scheme parameters:
- `title` (required): Task title (URL-encoded)
- `notes`: Task notes (URL-encoded)
- `when`: `today`, `tomorrow`, `evening`, `anytime`, `someday`, or a date (`YYYY-MM-DD`)
- `deadline`: Deadline date (`YYYY-MM-DD`)
- `tags`: Comma-separated tag names
- `list`: Project or area name to add the task to
- `heading`: Heading within a project
- `checklist-items`: Newline-separated (`%0a`) checklist items
- `completed`: `true` to mark as completed immediately

**Via AppleScript (for more control):**

```bash
osascript -e '
tell application "Things3"
    set newToDo to make new to do with properties {name:"TASK_TITLE", notes:"TASK_NOTES"}
end tell
'
```

### 2. Create a Project

```bash
open "things:///add-project?title=PROJECT_TITLE&notes=PROJECT_NOTES&when=today&tags=TAG1&area=AREA_NAME"
```

Parameters:
- `title` (required): Project title
- `notes`: Project notes
- `when`: Start date
- `deadline`: Deadline date
- `tags`: Comma-separated tags
- `area`: Area name to add the project to
- `to-dos`: Newline-separated (`%0a`) task titles to add inside the project

### 3. Search for Tasks

```bash
open "things:///search?query=SEARCH_TERM"
```

This opens Things 3 with the search results.

**Via AppleScript (to retrieve results programmatically):**

```bash
osascript -e '
tell application "Things3"
    set results to to dos whose name contains "SEARCH_TERM"
    set output to ""
    repeat with t in results
        set output to output & name of t & " | " & status of t & linefeed
    end repeat
    return output
end tell
'
```

### 4. Complete a Task

```bash
osascript -e '
tell application "Things3"
    set targetToDos to to dos whose name is "TASK_TITLE"
    repeat with t in targetToDos
        set status of t to completed
    end repeat
end tell
'
```

### 5. List Tasks (by list)

```bash
osascript -e '
tell application "Things3"
    set todoList to to dos of list "Today"
    set output to ""
    repeat with t in todoList
        set output to output & name of t & linefeed
    end repeat
    return output
end tell
'
```

Valid list names: `"Inbox"`, `"Today"`, `"Upcoming"`, `"Anytime"`, `"Someday"`, `"Logbook"`, `"Trash"`, or any project/area name.

### 6. Add Multiple Tasks via JSON

```bash
open "things:///json?data=[{\"type\":\"to-do\",\"attributes\":{\"title\":\"Task 1\",\"when\":\"today\"}},{\"type\":\"to-do\",\"attributes\":{\"title\":\"Task 2\",\"when\":\"tomorrow\"}}]"
```

For large JSON payloads, URL-encode the JSON data.

### 7. Show a Specific List

```bash
open "things:///show?id=today"
open "things:///show?id=inbox"
open "things:///show?id=upcoming"
open "things:///show?id=anytime"
open "things:///show?id=someday"
open "things:///show?id=logbook"
```

## URL Encoding

When constructing URL scheme commands, always URL-encode special characters in titles and notes:
- Space: `%20`
- Newline: `%0a`
- Ampersand: `%26`
- Hash: `%23`

Use Python or `python3 -c "import urllib.parse; print(urllib.parse.quote('text'))"` for encoding.

## Notes

- AppleScript operations require Things 3 to have appropriate permissions in System Settings > Privacy & Security > Automation.
- URL scheme operations will open/focus Things 3.
- The `things:///` URL scheme is documented at https://culturedcode.com/things/support/articles/2803573/
