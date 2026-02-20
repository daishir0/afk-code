---
name: songsee
description: Song identification and lyrics search. Use when the user asks to "find lyrics", "identify a song", "what song is this", or needs song/music information.
allowed-tools: Bash, WebFetch, WebSearch
---

# Song Identification & Lyrics Search (songsee)

Identify songs and search for lyrics using public APIs and web search.

## Trigger Phrases

- "この曲の歌詞を調べて" / "歌詞検索して"
- "〇〇の歌詞を教えて"
- "What song has these lyrics..."
- "Find lyrics for..."
- "曲を特定して"
- "Song identification"

## Lyrics Search

### Method 1: lyrics.ovh API (Free, No Auth)

```bash
# Search by artist and title
curl -s "https://api.lyrics.ovh/v1/ARTIST_NAME/SONG_TITLE" | python3 -m json.tool

# Examples
curl -s "https://api.lyrics.ovh/v1/Ed%20Sheeran/Shape%20of%20You" | python3 -m json.tool
curl -s "https://api.lyrics.ovh/v1/Queen/Bohemian%20Rhapsody" | python3 -m json.tool
```

Response format:
```json
{
  "lyrics": "Full lyrics text here..."
}
```

### Method 2: Web Search Fallback

If the lyrics.ovh API does not have the song, use WebSearch:

```
Use WebSearch tool: "ARTIST_NAME SONG_TITLE lyrics"
```

Then use WebFetch to extract lyrics from the result page.

### Method 3: MusicBrainz API (Metadata)

For song metadata, recordings, and identification:

```bash
# Search for a recording
curl -s "https://musicbrainz.org/ws/2/recording/?query=SONG_TITLE+AND+artist:ARTIST_NAME&fmt=json&limit=5" \
  -H "User-Agent: ClaudeCode/1.0 (your@email.com)" | python3 -m json.tool

# Search for an artist
curl -s "https://musicbrainz.org/ws/2/artist/?query=ARTIST_NAME&fmt=json&limit=5" \
  -H "User-Agent: ClaudeCode/1.0 (your@email.com)" | python3 -m json.tool

# Get release information
curl -s "https://musicbrainz.org/ws/2/release/?query=ALBUM_TITLE+AND+artist:ARTIST_NAME&fmt=json&limit=5" \
  -H "User-Agent: ClaudeCode/1.0 (your@email.com)" | python3 -m json.tool
```

### Method 4: AudD Song Recognition API (Audio Identification)

For Shazam-like audio identification (requires API key):

```yaml
# Add to env.yaml
audd_api_key: YOUR_AUDD_API_KEY
```

```bash
source ~/.claude/lib/load_env.sh

# Identify from audio file
curl -s "https://api.audd.io/" \
  -F "file=@/path/to/audio.mp3" \
  -F "api_token=${AUDD_API_KEY}" \
  -F "return=lyrics,musicbrainz" | python3 -m json.tool

# Identify from URL
curl -s "https://api.audd.io/" \
  -F "url=https://example.com/audio.mp3" \
  -F "api_token=${AUDD_API_KEY}" \
  -F "return=lyrics" | python3 -m json.tool
```

## Workflow

### Case 1: User knows artist and title
1. Query lyrics.ovh API with artist/title
2. Display formatted lyrics
3. Optionally save to `./outputs/lyrics_ARTIST_TITLE.txt`

### Case 2: User has partial lyrics
1. Use WebSearch with the partial lyrics as query
2. Identify the song from search results
3. Fetch full lyrics via lyrics.ovh or web scraping

### Case 3: User has an audio file
1. Use AudD API to identify the song
2. Extract artist/title from response
3. Fetch full lyrics

## Response Format

```
Song: [Song Title]
Artist: [Artist Name]
Album: [Album Name] (if available)

--- Lyrics ---
[Full lyrics here]
--------------

Source: [API or URL used]
```

## Saving Lyrics

```bash
mkdir -p ./outputs
# Save lyrics to file
echo "LYRICS_TEXT" > ./outputs/lyrics_ARTIST_TITLE.txt
```

## Notes

- lyrics.ovh is free but may not have all songs (especially Japanese songs)
- MusicBrainz requires a User-Agent header
- MusicBrainz rate limit: 1 request/second
- AudD free tier: 10 requests/day
- For Japanese lyrics, WebSearch with "歌詞" keyword is most reliable
- All platforms supported (Windows, Linux, Mac)
