---
name: gog
description: Google search, fetch, and summarize web content using WebSearch and WebFetch tools. Use when the user asks to "Google it", "search the web", "look up", "find information about", or needs web research with summarization.
allowed-tools: WebSearch, WebFetch, Bash, Read, Write
---

# Google Search & Summarize (gog)

Search the web, fetch pages, and provide summarized answers using Claude Code's built-in WebSearch and WebFetch tools.

## Trigger Phrases

- "ググって" / "検索して" / "調べて"
- "〇〇について調べて"
- "Google it" / "Search for..."
- "Look up..."
- "Find information about..."
- "What is the latest on..."

## Core Tools

### WebSearch
- Performs web searches and returns results with titles, snippets, and URLs
- Best for: Finding current information, discovering relevant pages

### WebFetch
- Fetches a specific URL and processes content with a prompt
- Best for: Extracting specific information from known pages

## Workflow

### Step 1: Search

Use WebSearch to find relevant pages:

```
WebSearch tool:
  query: "YOUR_SEARCH_QUERY"
```

Tips for effective queries:
- Include the current year for recent information (2026)
- Use specific technical terms
- Add "site:domain.com" to search within a specific site
- Use quotes for exact phrases

### Step 2: Fetch (Optional)

For detailed information from specific results:

```
WebFetch tool:
  url: "https://result-url.example.com/page"
  prompt: "Extract and summarize the key information about [topic]"
```

### Step 3: Summarize

Synthesize findings into a clear, structured answer.

## Search Patterns

### Basic Research

```
1. WebSearch: "topic keyword 2026"
2. Review search results
3. WebFetch top 2-3 most relevant URLs
4. Synthesize into summary
```

### Comparative Research

```
1. WebSearch: "product A vs product B comparison 2026"
2. WebFetch comparison articles
3. WebSearch: "product A review 2026"
4. WebSearch: "product B review 2026"
5. Compile comparison table
```

### Technical Documentation

```
1. WebSearch: "technology-name documentation official"
2. WebFetch official docs page
3. WebSearch: "technology-name tutorial example"
4. WebFetch tutorial pages for code examples
5. Summarize with working code snippets
```

### News/Current Events

```
1. WebSearch: "event/topic latest news 2026"
2. WebFetch top news articles (2-3 sources)
3. Cross-reference facts across sources
4. Present balanced summary with sources
```

### Price/Product Research

```
1. WebSearch: "product name price comparison"
2. WebFetch retailer pages
3. Compile price table with links
```

## Response Format

### Standard Research Response

```
[Topic] Summary

Key Findings:
1. [Finding 1] - [Source]
2. [Finding 2] - [Source]
3. [Finding 3] - [Source]

Details:
[Detailed explanation with information from multiple sources]

Sources:
- [Source Title 1](URL1)
- [Source Title 2](URL2)
- [Source Title 3](URL3)
```

### Quick Answer Response

```
Answer: [Direct answer]

Source: [URL]

Additional context: [Brief explanation if needed]
```

### Comparison Response

```
Comparison: [A] vs [B]

| Feature    | A          | B          |
|------------|------------|------------|
| Feature 1  | Value      | Value      |
| Feature 2  | Value      | Value      |
| Price      | $X         | $Y         |

Recommendation: [Based on findings]

Sources:
- [Source 1](URL1)
- [Source 2](URL2)
```

## Advanced Techniques

### Domain-Restricted Search

```
WebSearch: "query site:stackoverflow.com"
WebSearch: "query site:github.com"
WebSearch: "query site:arxiv.org"
```

### Temporal Search

```
WebSearch: "topic after:2026-01-01"
WebSearch: "topic 2026 latest"
```

### Multi-Language Search

```
# Search in Japanese
WebSearch: "トピック 最新情報 2026"

# Search in English for broader results
WebSearch: "topic latest information 2026"

# Combine findings from both languages
```

### Deep Dive Pattern

```
1. Broad search to understand the landscape
2. Identify key subtopics from results
3. Deep search each subtopic
4. WebFetch authoritative sources
5. Synthesize comprehensive report
```

## Saving Results

```bash
# Save research results to file
mkdir -p ./outputs
# Use Write tool to save to ./outputs/research_TOPIC.md
```

## Important Notes

- Always include "Sources:" section with URLs in responses
- WebSearch is only available in the US
- Use current year (2026) in queries for recent information
- WebFetch may fail on authenticated/private URLs
- For GitHub content, use `gh` CLI instead of WebFetch
- Cross-reference information from multiple sources
- Clearly distinguish between facts and opinions
- Note publication dates when relevance matters
- All platforms supported (Windows, Linux, Mac)
