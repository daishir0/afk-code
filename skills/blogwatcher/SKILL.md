---
name: blogwatcher
description: Blog and RSS feed monitoring with automatic summarization. Use when the user asks to "check blog feeds", "monitor RSS", "summarize new posts", "watch blogs", or needs to track updates from websites and feeds.
allowed-tools: Bash
---

# Blog & RSS Feed Monitor (blogwatcher)

Monitor blog and RSS feeds, detect new posts, and provide summaries.

## Trigger Phrases

- "ブログの更新を確認して" / "RSSフィードをチェック"
- "新しい記事をまとめて"
- "Check blog feeds"
- "Monitor RSS for..."
- "Summarize new blog posts"
- "Watch these feeds"

## Prerequisites

### Install Dependencies

```bash
source ~/.claude/lib/load_env.sh
run_python -m pip install -r ~/.claude/skills/blogwatcher/requirements.txt
```

### Feed Configuration

Feeds can be specified in three ways:

1. **Command-line argument** (single feed):
```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/blogwatcher/script.py --feed "https://example.com/feed.xml"
```

2. **Feeds file** (multiple feeds):
Create `./outputs/feeds.txt` with one URL per line:
```
https://blog.example.com/feed
https://another-blog.com/rss
https://news.ycombinator.com/rss
```

```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/blogwatcher/script.py --feeds-file ./outputs/feeds.txt
```

3. **Command-line multiple feeds**:
```bash
source ~/.claude/lib/load_env.sh
run_python ~/.claude/skills/blogwatcher/script.py --feed "https://feed1.com/rss" --feed "https://feed2.com/rss"
```

## Usage

### Check Feeds for New Posts

```bash
source ~/.claude/lib/load_env.sh

# Check a single feed (default: last 24 hours)
run_python ~/.claude/skills/blogwatcher/script.py --feed "https://example.com/feed.xml"

# Check with custom time window (hours)
run_python ~/.claude/skills/blogwatcher/script.py --feed "https://example.com/feed.xml" --hours 48

# Check all feeds from file
run_python ~/.claude/skills/blogwatcher/script.py --feeds-file ./outputs/feeds.txt --hours 24

# Limit results
run_python ~/.claude/skills/blogwatcher/script.py --feed "https://example.com/feed.xml" --limit 5

# Output as JSON
run_python ~/.claude/skills/blogwatcher/script.py --feed "https://example.com/feed.xml" --json

# Save results to file
run_python ~/.claude/skills/blogwatcher/script.py --feeds-file ./outputs/feeds.txt --output ./outputs/feed_report.md
```

### Command-Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--feed URL` | `-f` | RSS/Atom feed URL (repeatable) | - |
| `--feeds-file PATH` | `-F` | File with feed URLs (one per line) | - |
| `--hours N` | `-H` | Look back N hours for new posts | 24 |
| `--limit N` | `-l` | Max posts per feed | 10 |
| `--json` | `-j` | Output as JSON | false |
| `--output PATH` | `-o` | Save report to file | stdout |
| `--verbose` | `-v` | Include full content | false |

## Popular RSS Feeds

### Tech News
- Hacker News: `https://news.ycombinator.com/rss`
- TechCrunch: `https://techcrunch.com/feed/`
- The Verge: `https://www.theverge.com/rss/index.xml`
- Ars Technica: `https://feeds.arstechnica.com/arstechnica/index`

### AI/ML
- OpenAI Blog: `https://openai.com/blog/rss.xml`
- Google AI Blog: `https://blog.google/technology/ai/rss/`
- Hugging Face Blog: `https://huggingface.co/blog/feed.xml`

### Dev
- GitHub Blog: `https://github.blog/feed/`
- Dev.to: `https://dev.to/feed`
- CSS-Tricks: `https://css-tricks.com/feed/`

### Japanese Tech
- Zenn Trending: `https://zenn.dev/feed`
- Qiita Trending: `https://qiita.com/popular-items/feed`
- Hatena Tech: `https://b.hatena.ne.jp/hotentry/it.rss`

## Output Format

### Text Output (Default)

```
Blog Feed Report (Last 24 hours)
================================

Feed: Example Blog (https://example.com)
  1. [2026-02-20 14:30] Article Title
     URL: https://example.com/post-1
     Summary: First 200 characters of the post content...

  2. [2026-02-19 09:15] Another Article
     URL: https://example.com/post-2
     Summary: First 200 characters...

Feed: Another Blog (https://another.com)
  (No new posts in the last 24 hours)

---
Total: 2 new posts from 2 feeds
```

### JSON Output

```json
{
  "report_time": "2026-02-20T15:00:00",
  "hours_back": 24,
  "feeds": [
    {
      "title": "Example Blog",
      "url": "https://example.com",
      "posts": [
        {
          "title": "Article Title",
          "url": "https://example.com/post-1",
          "published": "2026-02-20T14:30:00",
          "summary": "First 200 characters..."
        }
      ]
    }
  ],
  "total_posts": 2,
  "total_feeds": 2
}
```

## Notes

- Requires `feedparser` and `requests` Python packages
- Works with both RSS 2.0 and Atom feeds
- Feed dates are parsed and compared in UTC
- Some feeds may not include full content (summary only)
- Rate limiting: Be respectful of feed servers, avoid excessive polling
- Output saved to `./outputs/` directory
- All platforms supported (Windows, Linux, Mac)
