---
name: apple-notes
description: Apple Notesアプリの読み書き・検索をAppleScript(osascript)経由で行うスキル（macOS専用）
---

# Apple Notes スキル

macOSのApple Notesアプリに対して、ノートの作成・読み取り・検索を行います。
すべての操作は `osascript` コマンド（AppleScript）を使用します。

## 前提条件

- macOS環境であること
- Apple Notesアプリがインストールされていること（標準搭載）
- 初回実行時にオートメーション権限の許可が求められる場合がある

## 操作一覧

### 1. ノート一覧の取得

指定フォルダ（またはデフォルトフォルダ）のノート名一覧を取得します。

```bash
osascript -e '
tell application "Notes"
    set noteNames to {}
    repeat with n in notes of default account
        set end of noteNames to name of n
    end repeat
    return noteNames
end tell
'
```

特定フォルダのノートを取得する場合:

```bash
osascript -e '
tell application "Notes"
    set noteNames to {}
    repeat with n in notes of folder "メモ" of default account
        set end of noteNames to name of n
    end repeat
    return noteNames
end tell
'
```

### 2. ノートの内容を読み取る

ノート名を指定して、本文（プレーンテキスト）を取得します。

```bash
osascript -e '
tell application "Notes"
    set targetNote to first note of default account whose name is "ノートのタイトル"
    return plaintext of targetNote
end tell
'
```

### 3. ノートの作成

新しいノートを作成します。`body`にはHTML形式のテキストを指定できます。

```bash
osascript -e '
tell application "Notes"
    make new note at folder "メモ" of default account with properties {name:"タイトル", body:"<h1>見出し</h1><p>本文テキスト</p>"}
end tell
'
```

シンプルなプレーンテキストで作成する場合:

```bash
osascript -e '
tell application "Notes"
    make new note at folder "メモ" of default account with properties {name:"タイトル", body:"本文テキスト"}
end tell
'
```

### 4. ノートの検索

ノート名で部分一致検索を行います。

```bash
osascript -e '
tell application "Notes"
    set matchedNotes to {}
    repeat with n in notes of default account
        if name of n contains "検索キーワード" then
            set end of matchedNotes to name of n
        end if
    end repeat
    return matchedNotes
end tell
'
```

本文の内容で検索する場合:

```bash
osascript -e '
tell application "Notes"
    set matchedNotes to {}
    repeat with n in notes of default account
        if plaintext of n contains "検索キーワード" then
            set end of matchedNotes to name of n
        end if
    end repeat
    return matchedNotes
end tell
'
```

### 5. ノートの更新（本文の追記）

既存ノートの本文末尾にテキストを追記します。

```bash
osascript -e '
tell application "Notes"
    set targetNote to first note of default account whose name is "ノートのタイトル"
    set currentBody to body of targetNote
    set body of targetNote to currentBody & "<br><p>追記テキスト</p>"
end tell
'
```

### 6. ノートの削除

```bash
osascript -e '
tell application "Notes"
    delete (first note of default account whose name is "ノートのタイトル")
end tell
'
```

### 7. フォルダ一覧の取得

```bash
osascript -e '
tell application "Notes"
    set folderNames to {}
    repeat with f in folders of default account
        set end of folderNames to name of f
    end repeat
    return folderNames
end tell
'
```

## 注意事項

- ノートのタイトルや本文に特殊文字（`"`, `'`, `\`）が含まれる場合はエスケープが必要
- 大量のノートがある場合、一覧取得に時間がかかることがある
- AppleScriptの文字列はダブルクォートの中にダブルクォートを含められないため、変数展開が必要な場合はファイル経由で実行を推奨
- body はHTML形式で保存される。読み取り時に `plaintext` を使うとプレーンテキストで取得できる
