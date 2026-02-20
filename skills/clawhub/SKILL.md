---
name: clawhub
description: Skill marketplace for browsing, installing, sharing, and managing Claude Code skills. Use when the user asks to "find a skill", "install a skill", "share a skill", "list available skills", or wants to explore the skill ecosystem. Inspired by OpenClaw Hub.
allowed-tools: Bash, Read, Write, Glob, Grep, WebFetch, WebSearch
---

# ClawHub - Skill Marketplace (clawhub)

Browse, install, share, and manage Claude Code skills from a centralized marketplace.

## Trigger Phrases

- "スキルを探して" / "新しいスキルをインストール"
- "スキルを共有して" / "スキルマーケットプレイス"
- "Find a skill for..."
- "Install skill..."
- "Share my skill"
- "List available skills"
- "Browse ClawHub"

## Concept

ClawHub is a skill marketplace and registry that enables:
1. **Browsing** - Discover skills from the community
2. **Installing** - Download and set up skills locally
3. **Sharing** - Publish your skills for others
4. **Updating** - Keep skills up to date

## Skill Registry Sources

### 1. GitHub-based Registry (Primary)

Skills can be hosted as GitHub repositories following a standard format:

```
github.com/username/claude-skill-NAME/
  ├── SKILL.md
  ├── script.py (optional)
  ├── requirements.txt (optional)
  └── README.md
```

### 2. Local Registry

The local skill inventory lives at `~/.claude/skills/` and can be listed:

```bash
# List all installed skills
ls -1 ~/.claude/skills/

# List skills with descriptions
for dir in ~/.claude/skills/*/; do
  name=$(basename "$dir")
  desc=$(head -5 "$dir/SKILL.md" 2>/dev/null | grep "description:" | sed 's/description: //')
  echo "$name: $desc"
done
```

## Browsing Skills

### Search GitHub for Skills

```bash
# Search GitHub for Claude Code skills
gh search repos "claude-skill" --sort stars --limit 20

# Search with specific topic
gh search repos "claude code skill" --topic claude-code --limit 20

# Search by language
gh search repos "claude-skill" --language python --limit 20
```

### Search via WebSearch

Use the WebSearch tool to find community skills:
```
WebSearch: "Claude Code skill" site:github.com
WebSearch: "SKILL.md" "allowed-tools" site:github.com
```

### Browse Curated Lists

Known skill collections and registries:
- GitHub Topics: `claude-code`, `claude-skill`
- Community repos that aggregate skills

## Installing Skills

### From GitHub Repository

```bash
# Clone a skill into the skills directory
cd ~/.claude/skills
git clone https://github.com/username/claude-skill-NAME.git skill-name

# Or use gh CLI
gh repo clone username/claude-skill-NAME ~/.claude/skills/skill-name
```

### Install Dependencies

```bash
# If the skill has a requirements.txt
source ~/.claude/lib/load_env.sh
run_python -m pip install -r ~/.claude/skills/skill-name/requirements.txt

# If the skill has package.json (Node.js)
cd ~/.claude/skills/skill-name && npm install
```

### Verify Installation

```bash
# Check SKILL.md exists and is valid
cat ~/.claude/skills/skill-name/SKILL.md | head -10

# Check for required files
ls -la ~/.claude/skills/skill-name/
```

## Sharing Skills

### Prepare Skill for Sharing

1. Ensure SKILL.md has proper frontmatter:
```yaml
---
name: your-skill-name
description: Clear description of what the skill does and when to use it
allowed-tools: Bash, Read, Write
---
```

2. Remove environment-specific paths and credentials
3. Add a README.md with setup instructions
4. Include requirements.txt if Python dependencies exist

### Publish to GitHub

```bash
# Initialize a new repo for the skill
cd ~/.claude/skills/skill-name
git init
git add .
git commit -m "Initial release of skill-name"

# Create GitHub repo and push
gh repo create claude-skill-NAME --public --source=. --push

# Add topics for discoverability
gh repo edit --add-topic claude-code,claude-skill,claude-code-skill
```

### Skill Packaging Checklist

- [ ] SKILL.md with proper frontmatter (name, description, allowed-tools)
- [ ] No hardcoded paths or credentials
- [ ] Uses `~/.claude/` relative paths
- [ ] Uses `source ~/.claude/lib/load_env.sh` for environment setup
- [ ] Output to `./outputs/` directory
- [ ] requirements.txt if Python packages needed
- [ ] README.md with installation/setup instructions
- [ ] .gitignore for sensitive files

## Updating Skills

```bash
# Update a specific skill from its git remote
cd ~/.claude/skills/skill-name && git pull

# Update all git-based skills
for dir in ~/.claude/skills/*/; do
  if [ -d "$dir/.git" ]; then
    echo "Updating $(basename $dir)..."
    cd "$dir" && git pull
    cd -
  fi
done
```

## Removing Skills

```bash
# Remove a skill
rm -rf ~/.claude/skills/skill-name

# Or move to backup
mv ~/.claude/skills/skill-name ~/.claude/skills/.archived/skill-name
```

## Skill Discovery Format

When presenting skills to the user:

```
Available Skills:

1. skill-name
   Description: What it does
   Source: github.com/user/repo
   Stars: 42
   Last Updated: 2026-02-15

2. another-skill
   Description: What it does
   Source: github.com/user/repo
   Stars: 28
   Last Updated: 2026-01-30

Install with: gh repo clone user/repo ~/.claude/skills/skill-name
```

## Local Skill Inventory Report

```
Installed Skills (12):
  Name             | Has Script | Dependencies | Git Tracked
  -----------------|------------|-------------|------------
  slack-notify     | Yes (py)   | slack-sdk   | Yes
  gifgrep          | No         | None        | No
  blogwatcher      | Yes (py)   | feedparser  | No
  ...

  Total: 12 skills
  With scripts: 8
  Git-tracked: 5
```

## Notes

- Skills should be self-contained within their directory
- Never store API keys or credentials in shared skills
- Use env.yaml references for all environment-specific configuration
- Follow the SKILL.md frontmatter format for compatibility
- GitHub-based distribution is the primary sharing mechanism
- All platforms supported (Windows, Linux, Mac)
