---
name: apple-reminders
description: Apple Remindersアプリのリマインダー管理をAppleScript(osascript)経由で行うスキル（macOS専用）
---

# Apple Reminders スキル

macOSのApple Remindersアプリに対して、リマインダーの一覧取得・作成・完了・検索を行います。
すべての操作は `osascript` コマンド（AppleScript）を使用します。

## 前提条件

- macOS環境であること
- Apple Remindersアプリがインストールされていること（標準搭載）
- 初回実行時にオートメーション権限の許可が求められる場合がある

## 操作一覧

### 1. リマインダーリスト（リスト名）の一覧取得

```bash
osascript -e '
tell application "Reminders"
    set listNames to {}
    repeat with l in lists
        set end of listNames to name of l
    end repeat
    return listNames
end tell
'
```

### 2. リマインダーの一覧取得

デフォルトリストの未完了リマインダーを取得:

```bash
osascript -e '
tell application "Reminders"
    set reminderNames to {}
    repeat with r in (reminders of default list whose completed is false)
        set end of reminderNames to name of r
    end repeat
    return reminderNames
end tell
'
```

特定リストのリマインダーを取得:

```bash
osascript -e '
tell application "Reminders"
    set reminderNames to {}
    repeat with r in (reminders of list "買い物" whose completed is false)
        set end of reminderNames to name of r
    end repeat
    return reminderNames
end tell
'
```

### 3. リマインダーの詳細取得（名前・期日・メモ）

```bash
osascript -e '
tell application "Reminders"
    set output to ""
    repeat with r in (reminders of default list whose completed is false)
        set rName to name of r
        set rBody to body of r
        try
            set rDate to due date of r as string
        on error
            set rDate to "期日なし"
        end try
        set output to output & rName & " | " & rDate & " | " & rBody & linefeed
    end repeat
    return output
end tell
'
```

### 4. リマインダーの作成

シンプルなリマインダー（期日なし）:

```bash
osascript -e '
tell application "Reminders"
    make new reminder in default list with properties {name:"牛乳を買う", body:"メモ: 低脂肪"}
end tell
'
```

期日付きリマインダーの作成:

```bash
osascript -e '
tell application "Reminders"
    set dueDate to date "2026年3月1日 09:00:00"
    make new reminder in default list with properties {name:"レポート提出", due date:dueDate, body:"最終版を提出"}
end tell
'
```

特定リストに作成:

```bash
osascript -e '
tell application "Reminders"
    make new reminder in list "仕事" with properties {name:"会議の準備", body:"資料を印刷"}
end tell
'
```

### 5. リマインダーを完了にする

```bash
osascript -e '
tell application "Reminders"
    set targetReminder to first reminder of default list whose name is "牛乳を買う"
    set completed of targetReminder to true
end tell
'
```

### 6. 期日で絞り込んで取得

今日が期日のリマインダーを取得:

```bash
osascript -e '
tell application "Reminders"
    set todayStart to current date
    set time of todayStart to 0
    set todayEnd to todayStart + (1 * days)
    set output to ""
    repeat with r in (reminders of default list whose completed is false)
        try
            set rDate to due date of r
            if rDate >= todayStart and rDate < todayEnd then
                set output to output & name of r & " | " & (rDate as string) & linefeed
            end if
        end try
    end repeat
    return output
end tell
'
```

期限切れ（過去の期日）のリマインダーを取得:

```bash
osascript -e '
tell application "Reminders"
    set now to current date
    set output to ""
    repeat with r in (reminders of default list whose completed is false)
        try
            set rDate to due date of r
            if rDate < now then
                set output to output & name of r & " | " & (rDate as string) & linefeed
            end if
        end try
    end repeat
    return output
end tell
'
```

### 7. 完了済みリマインダーの取得

```bash
osascript -e '
tell application "Reminders"
    set completedNames to {}
    repeat with r in (reminders of default list whose completed is true)
        set end of completedNames to name of r
    end repeat
    return completedNames
end tell
'
```

### 8. リマインダーの削除

```bash
osascript -e '
tell application "Reminders"
    delete (first reminder of default list whose name is "削除するリマインダー名")
end tell
'
```

### 9. 新しいリストの作成

```bash
osascript -e '
tell application "Reminders"
    make new list with properties {name:"新しいリスト名"}
end tell
'
```

## 注意事項

- 日付のフォーマットはシステムのロケールに依存する（日本語環境: `"2026年3月1日 09:00:00"`、英語環境: `"March 1, 2026 9:00:00 AM"`）
- リマインダー名に特殊文字が含まれる場合はエスケープが必要
- `body`が空の場合、取得時に`missing value`が返される場合がある（tryブロックで対処推奨）
- 大量のリマインダーがある場合は処理に時間がかかることがある
