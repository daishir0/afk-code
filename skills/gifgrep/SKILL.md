---
name: gifgrep
description: GIF search and download via Giphy/Tenor API. Use when the user asks to "find a GIF", "search GIF", "GIF for X", or needs animated images for any purpose.
allowed-tools: Bash
---

# GIF Search (gifgrep)

Search and download GIFs using the Giphy and Tenor APIs via curl commands.

## Trigger Phrases

- "GIFを探して" / "GIF検索して"
- "〇〇のGIFちょうだい"
- "Find a GIF of..."
- "Search GIF for..."
- "面白いGIFを送って"

## Prerequisites

### API Keys (set in env.yaml)

```yaml
# Giphy API Key (get from https://developers.giphy.com/)
giphy_api_key: YOUR_GIPHY_API_KEY

# Tenor API Key (get from https://developers.google.com/tenor/guides/quickstart)
tenor_api_key: YOUR_TENOR_API_KEY
```

## Usage

### 1. Search GIFs via Giphy API

```bash
source ~/.claude/lib/load_env.sh

# Search GIFs (returns JSON with URLs)
curl -s "https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=SEARCH_TERM&limit=5&rating=g" | python3 -m json.tool

# Trending GIFs
curl -s "https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=5&rating=g" | python3 -m json.tool

# Random GIF by tag
curl -s "https://api.giphy.com/v1/gifs/random?api_key=${GIPHY_API_KEY}&tag=SEARCH_TERM&rating=g" | python3 -m json.tool
```

### 2. Search GIFs via Tenor API

```bash
source ~/.claude/lib/load_env.sh

# Search GIFs
curl -s "https://tenor.googleapis.com/v2/search?q=SEARCH_TERM&key=${TENOR_API_KEY}&limit=5" | python3 -m json.tool

# Featured/Trending GIFs
curl -s "https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=5" | python3 -m json.tool
```

### 3. Download a GIF

```bash
# Download GIF to outputs directory
mkdir -p ./outputs
curl -sL "GIF_URL_HERE" -o ./outputs/downloaded.gif
```

## Response Format

When presenting results to the user, show:

```
GIF Search Results for "QUERY":

1. Title: [title]
   URL: [gif_url]
   Preview: [small_url]

2. Title: [title]
   URL: [gif_url]
   Preview: [small_url]

Which GIF would you like to download? (specify number)
```

## Parsing Giphy Response

Key fields in Giphy response JSON:
- `data[].title` - GIF title
- `data[].images.original.url` - Full-size GIF URL
- `data[].images.downsized.url` - Smaller GIF URL
- `data[].images.fixed_height.url` - Fixed height (200px) URL
- `data[].url` - Giphy page URL

## Parsing Tenor Response

Key fields in Tenor response JSON:
- `results[].title` - GIF title
- `results[].media_formats.gif.url` - Full GIF URL
- `results[].media_formats.tinygif.url` - Small GIF URL
- `results[].media_formats.mp4.url` - MP4 version URL
- `results[].itemurl` - Tenor page URL

## Fallback (No API Key)

If no API key is configured, use the Giphy public beta key for testing:
```bash
# Public beta key (rate-limited, for testing only)
curl -s "https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=SEARCH_TERM&limit=5&rating=g"
```

## Notes

- Giphy rate limit: Varies by plan (free tier: 42 searches/hour)
- Tenor rate limit: Based on Google Cloud quota
- GIF files can be large; prefer `downsized` or `tinygif` for chat use
- Output files saved to `./outputs/`
- All platforms supported (Windows, Linux, Mac)
