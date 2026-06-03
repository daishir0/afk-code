#!/usr/bin/env python3
"""
Claude Code 会話ログを日次ノートに追記するスクリプト
~/.claude/projects/ 配下の全プロジェクトを動的にスキャン
前回記録以降の新しい会話のみを抽出。JST日付ごとに対応するノートに書き込む。
"""
import json, glob, os
from datetime import datetime, timezone, timedelta

_tz_offset = int(os.environ.get("LOCAL_TIMEZONE_OFFSET", "9"))
JST = timezone(timedelta(hours=_tz_offset))

PROJECTS_DIR  = os.path.expanduser("~/.claude/projects")
MEMORY_DIR    = os.path.expanduser("~/.afk-code/memory")
LAST_LOG_FILE = os.path.expanduser("~/.afk-code/last_conv_log.txt")
SKIP_PATTERNS = [
    "[HEARTBEAT", "[CRON:", "<task-notification>",
    "<system-reminder>", "Base directory for this skill:",
]


def load_last_timestamp():
    if os.path.exists(LAST_LOG_FILE):
        with open(LAST_LOG_FILE) as f:
            ts = f.read().strip()
            if ts:
                return datetime.fromisoformat(ts)
    return datetime.min.replace(tzinfo=timezone.utc)


def save_last_timestamp(dt: datetime):
    with open(LAST_LOG_FILE, "w") as f:
        f.write(dt.isoformat())


def parse_ts(ts_str: str):
    if not ts_str:
        return None
    try:
        ts_str = ts_str.rstrip("Z")
        if "+" in ts_str:
            ts_str = ts_str.split("+")[0]
        dt = datetime.fromisoformat(ts_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def extract_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [c["text"] for c in content if isinstance(c, dict) and c.get("type") == "text"]
        return " ".join(parts)
    return ""


def should_skip(text: str) -> bool:
    return any(p in text for p in SKIP_PATTERNS)


def collect_messages(since_dt: datetime) -> list:
    """全プロジェクトから since_dt より新しいメッセージを収集"""
    messages = []
    if not os.path.isdir(PROJECTS_DIR):
        return messages

    for proj in sorted(os.listdir(PROJECTS_DIR)):
        proj_path = os.path.join(PROJECTS_DIR, proj)
        if not os.path.isdir(proj_path):
            continue
        for jfile in sorted(glob.glob(f"{proj_path}/*.jsonl")):
            try:
                with open(jfile, encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        try:
                            d = json.loads(line)
                            if d.get("type") not in ("user", "assistant"):
                                continue
                            role = d.get("message", {}).get("role", "")
                            if role not in ("user", "assistant"):
                                continue
                            ts = parse_ts(d.get("timestamp", ""))
                            if not ts or ts <= since_dt:
                                continue
                            text = extract_text(d["message"].get("content", "")).strip()
                            if not text or should_skip(text):
                                continue
                            proj_label = (
                                proj.replace("-Users-pathfinder-aibot-", "~/").replace("-", "/", 1)
                                if proj.startswith("-Users") else proj
                            )
                            messages.append({
                                "ts":   ts,
                                "role": role,
                                "text": text[:300],
                                "proj": proj_label,
                            })
                        except Exception:
                            continue
            except Exception:
                continue

    messages.sort(key=lambda m: m["ts"])
    return messages


def summarize(messages: list) -> str | None:
    """会話を人が読みやすい形式にまとめる"""
    if not messages:
        return None

    by_proj: dict[str, list] = {}
    for m in messages:
        by_proj.setdefault(m["proj"], []).append(m)

    lines = []
    for proj, msgs in by_proj.items():
        lines.append(f"**[{proj}]**")
        for m in [x for x in msgs if x["role"] == "user"]:
            text = m["text"].replace("\n", " ")[:150]
            lines.append(f"  - {m['ts'].astimezone(JST).strftime('%H:%M')} {text}")
        ai_count = sum(1 for x in msgs if x["role"] == "assistant")
        if ai_count:
            lines.append(f"  → AI応答 {ai_count}件")
    return "\n".join(lines)


def fmt_ts(dt: datetime) -> str:
    """MM/DD HH:MM 形式（常に日付付き・逆転表示を防ぐ）"""
    return dt.astimezone(JST).strftime("%m/%d %H:%M")


def append_to_note(note_date: str, summary: str, msg_count: int,
                   since_dt: datetime, now_jst: datetime):
    """指定日付のノートに追記"""
    note_path = os.path.join(MEMORY_DIR, f"{note_date}.md")

    since_str = fmt_ts(since_dt) if since_dt != datetime.min.replace(tzinfo=timezone.utc) else "起動時"
    now_str   = fmt_ts(now_jst)

    entry = f"\n## 会話ログ（{since_str}〜{now_str}）\n{summary}\n"

    if os.path.exists(note_path):
        with open(note_path, "a", encoding="utf-8") as f:
            f.write(entry)
    else:
        with open(note_path, "w", encoding="utf-8") as f:
            f.write(f"# {note_date} 日次ノート\n{entry}")

    print(f"日次ノートに追記: {msg_count}件の会話 → {note_path}")


def main():
    since_dt = load_last_timestamp()
    now_utc  = datetime.now(timezone.utc)
    now_jst  = now_utc.astimezone(JST)

    messages = collect_messages(since_dt)
    if not messages:
        print("新しい会話なし")
        save_last_timestamp(now_utc)
        return

    # JST日付ごとにグループ化して、各日付のノートに書き込む
    by_date: dict[str, list] = {}
    for m in messages:
        date_key = m["ts"].astimezone(JST).strftime("%Y-%m-%d")
        by_date.setdefault(date_key, []).append(m)

    total = 0
    for note_date in sorted(by_date.keys()):
        date_msgs = by_date[note_date]
        summary = summarize(date_msgs)
        if summary:
            append_to_note(note_date, summary, len(date_msgs), since_dt, now_jst)
            total += len(date_msgs)

    save_last_timestamp(now_utc)


if __name__ == "__main__":
    main()
