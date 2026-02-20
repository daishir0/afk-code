#!/usr/bin/env python3
"""
Blog & RSS Feed Monitor - Check feeds for new posts and summarize them.

Usage:
    python script.py --feed "https://example.com/feed.xml"
    python script.py --feeds-file feeds.txt --hours 48
    python script.py --feed "https://feed1.com/rss" --feed "https://feed2.com/rss" --json
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

try:
    import feedparser
except ImportError:
    print("Error: feedparser not installed. Run: pip install feedparser", file=sys.stderr)
    sys.exit(1)

try:
    import requests
except ImportError:
    print("Error: requests not installed. Run: pip install requests", file=sys.stderr)
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Blog & RSS Feed Monitor")
    parser.add_argument(
        "--feed", "-f", action="append", default=[],
        help="RSS/Atom feed URL (can be specified multiple times)"
    )
    parser.add_argument(
        "--feeds-file", "-F", type=str, default=None,
        help="Path to file containing feed URLs (one per line)"
    )
    parser.add_argument(
        "--hours", "-H", type=int, default=24,
        help="Look back N hours for new posts (default: 24)"
    )
    parser.add_argument(
        "--limit", "-l", type=int, default=10,
        help="Max posts per feed (default: 10)"
    )
    parser.add_argument(
        "--json", "-j", action="store_true",
        help="Output as JSON"
    )
    parser.add_argument(
        "--output", "-o", type=str, default=None,
        help="Save report to file"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Include full content"
    )
    return parser.parse_args()


def load_feeds_from_file(filepath):
    """Load feed URLs from a text file (one URL per line)."""
    feeds = []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    feeds.append(line)
    except FileNotFoundError:
        print(f"Error: Feeds file not found: {filepath}", file=sys.stderr)
        sys.exit(1)
    return feeds


def parse_entry_date(entry):
    """Parse the published/updated date from a feed entry."""
    date_fields = [
        "published_parsed", "updated_parsed", "created_parsed"
    ]
    for field in date_fields:
        parsed = getattr(entry, field, None)
        if parsed:
            try:
                from time import mktime
                return datetime.fromtimestamp(mktime(parsed), tz=timezone.utc)
            except (ValueError, OverflowError, OSError):
                continue
    return None


def get_entry_summary(entry, verbose=False):
    """Extract a summary from a feed entry."""
    if verbose:
        # Try to get full content
        if hasattr(entry, "content") and entry.content:
            return entry.content[0].get("value", "")
        if hasattr(entry, "summary"):
            return entry.summary
    else:
        # Get short summary
        text = ""
        if hasattr(entry, "summary"):
            text = entry.summary
        elif hasattr(entry, "content") and entry.content:
            text = entry.content[0].get("value", "")

        # Strip HTML tags (basic)
        import re
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"\s+", " ", text).strip()

        # Truncate
        if len(text) > 200:
            text = text[:200] + "..."
        return text

    return ""


def fetch_feed(url, hours_back, limit, verbose=False):
    """Fetch and parse an RSS/Atom feed."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_back)

    try:
        # Use requests for better error handling and timeout
        headers = {"User-Agent": "BlogWatcher/1.0 (Claude Code Skill)"}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        feed = feedparser.parse(response.content)
    except requests.RequestException as e:
        return {
            "title": url,
            "url": url,
            "error": str(e),
            "posts": []
        }

    feed_title = feed.feed.get("title", url)
    feed_link = feed.feed.get("link", url)

    posts = []
    for entry in feed.entries:
        pub_date = parse_entry_date(entry)

        # If no date available, include it (we can't filter)
        if pub_date and pub_date < cutoff:
            continue

        post = {
            "title": getattr(entry, "title", "Untitled"),
            "url": getattr(entry, "link", ""),
            "published": pub_date.isoformat() if pub_date else "Unknown",
            "summary": get_entry_summary(entry, verbose)
        }
        posts.append(post)

        if len(posts) >= limit:
            break

    return {
        "title": feed_title,
        "url": feed_link,
        "posts": posts
    }


def format_text_report(results, hours_back):
    """Format results as text report."""
    lines = []
    lines.append(f"Blog Feed Report (Last {hours_back} hours)")
    lines.append("=" * 50)
    lines.append("")

    total_posts = 0
    for feed_result in results:
        lines.append(f"Feed: {feed_result['title']}")
        lines.append(f"  URL: {feed_result['url']}")

        if "error" in feed_result:
            lines.append(f"  Error: {feed_result['error']}")
            lines.append("")
            continue

        if not feed_result["posts"]:
            lines.append(f"  (No new posts in the last {hours_back} hours)")
            lines.append("")
            continue

        for i, post in enumerate(feed_result["posts"], 1):
            total_posts += 1
            pub_str = post["published"]
            if pub_str != "Unknown":
                try:
                    pub_dt = datetime.fromisoformat(pub_str)
                    pub_str = pub_dt.strftime("%Y-%m-%d %H:%M")
                except ValueError:
                    pass

            lines.append(f"  {i}. [{pub_str}] {post['title']}")
            lines.append(f"     URL: {post['url']}")
            if post["summary"]:
                lines.append(f"     Summary: {post['summary']}")
            lines.append("")

        lines.append("")

    lines.append("---")
    lines.append(f"Total: {total_posts} new posts from {len(results)} feeds")

    return "\n".join(lines)


def format_json_report(results, hours_back):
    """Format results as JSON."""
    total_posts = sum(len(f.get("posts", [])) for f in results)
    report = {
        "report_time": datetime.now(timezone.utc).isoformat(),
        "hours_back": hours_back,
        "feeds": results,
        "total_posts": total_posts,
        "total_feeds": len(results)
    }
    return json.dumps(report, ensure_ascii=False, indent=2)


def main():
    args = parse_args()

    # Collect all feed URLs
    feed_urls = list(args.feed)
    if args.feeds_file:
        feed_urls.extend(load_feeds_from_file(args.feeds_file))

    if not feed_urls:
        print("Error: No feed URLs specified. Use --feed URL or --feeds-file PATH",
              file=sys.stderr)
        sys.exit(1)

    # Fetch all feeds
    results = []
    for url in feed_urls:
        print(f"Fetching: {url}...", file=sys.stderr)
        result = fetch_feed(url, args.hours, args.limit, args.verbose)
        results.append(result)

    # Format output
    if args.json:
        output = format_json_report(results, args.hours)
    else:
        output = format_text_report(results, args.hours)

    # Write output
    if args.output:
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"Report saved to: {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
