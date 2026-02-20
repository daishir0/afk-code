---
name: voice-call
description: Voice synthesis using macOS say command. Text-to-speech with various voices, save to audio files, and adjust speech parameters.
---

# Voice Synthesis (macOS)

Generate speech from text using the macOS built-in `say` command. Supports multiple languages, voices, and audio output formats.

## Prerequisites

- macOS (the `say` command is built-in)
- Additional voices can be downloaded from: System Settings > Accessibility > Spoken Content > System Voice > Manage Voices

## Operations

### 1. Speak Text Aloud

```bash
say "Hello, this is a test."
```

**With a specific voice:**
```bash
say -v Samantha "Hello, this is a test."
```

**In Japanese:**
```bash
say -v Kyoko "こんにちは、テストです。"
```

### 2. Save Speech to Audio File

**Save as AIFF (default):**
```bash
say -v Samantha -o ./outputs/speech.aiff "Hello, this is a test."
```

**Save as MP4/AAC:**
```bash
say -v Samantha -o ./outputs/speech.m4a --data-format=aac "Hello, this is a test."
```

**Save as WAVE:**
```bash
say -v Samantha -o ./outputs/speech.wav --data-format=LEI16@22050 "Hello, this is a test."
```

Common data formats:
- `aac` - AAC (good quality, small file, .m4a)
- `LEI16@22050` - 16-bit Little Endian PCM at 22050 Hz (.wav)
- `LEI16@44100` - 16-bit Little Endian PCM at 44100 Hz (.wav)
- `LEF32@22050` - 32-bit Float PCM at 22050 Hz (.wav)

### 3. Control Speech Rate

```bash
# Slower (default is ~175-200 words per minute)
say -v Samantha -r 120 "This is spoken slowly."

# Faster
say -v Samantha -r 300 "This is spoken quickly."
```

The `-r` flag sets words per minute. Typical range: 80-400.

### 4. Read from a File

```bash
say -v Samantha -f ./inputs/script.txt
```

**Save file content as audio:**
```bash
say -v Samantha -f ./inputs/script.txt -o ./outputs/narration.aiff
```

### 5. List Available Voices

**List all installed voices:**
```bash
say -v '?'
```

**Filter by language:**
```bash
# Japanese voices
say -v '?' | grep 'ja_JP'

# English voices
say -v '?' | grep 'en_US'

# All English variants
say -v '?' | grep 'en_'
```

### 6. Common Voices by Language

**English (US):**
| Voice | Gender | Notes |
|-------|--------|-------|
| Samantha | Female | Default US English |
| Alex | Male | High quality |
| Ava | Female | Premium |
| Tom | Male | Premium |
| Allison | Female | Siri-quality |

**English (UK):**
| Voice | Gender | Notes |
|-------|--------|-------|
| Daniel | Male | British English |
| Kate | Female | British English |
| Serena | Female | British English |

**Japanese:**
| Voice | Gender | Notes |
|-------|--------|-------|
| Kyoko | Female | Standard Japanese |
| Otoya | Male | Standard Japanese |

**Other languages:**
| Voice | Language | Gender |
|-------|----------|--------|
| Thomas | French | Male |
| Amelie | French Canadian | Female |
| Anna | German | Female |
| Luca | Italian | Male |
| Monica | Spanish | Female |
| Yuna | Korean | Female |
| Ting-Ting | Chinese (Mandarin) | Female |

Note: Available voices depend on what is installed. Use `say -v '?'` to check.

### 7. Speak with Interactive Feedback

**Highlight words as spoken (useful for testing):**
```bash
say -v Samantha --interactive "This text will be highlighted as it is spoken."
```

### 8. Background Speech

**Speak in the background (non-blocking):**
```bash
say -v Samantha "Working on it..." &
```

**Stop all speech:**
```bash
killall say
```

### 9. Chaining Multiple Voices

```bash
say -v Samantha "Hello!" && say -v Alex "How are you?" && say -v Kyoko "こんにちは！"
```

### 10. Convert AIFF to MP3 (using ffmpeg)

If `ffmpeg` is installed (`brew install ffmpeg`):

```bash
say -v Samantha -o /tmp/speech.aiff "Hello world"
ffmpeg -i /tmp/speech.aiff -codec:a libmp3lame -qscale:a 2 ./outputs/speech.mp3
rm /tmp/speech.aiff
```

### 11. Phonetic Pronunciation

Use the `[[` notation for phonetic control:

```bash
say "You can control [[emph +]] emphasis and [[slnc 500]] add pauses."
```

Special markup:
- `[[emph +]]` - Emphasize the next word
- `[[emph -]]` - Remove emphasis
- `[[slnc N]]` - Silence for N milliseconds
- `[[rate N]]` - Change rate to N words per minute
- `[[volm N]]` - Change volume (0.0 to 1.0)
- `[[pbas N]]` - Change pitch baseline (in Hz)
- `[[rset N]]` - Reset parameter to default

## Output Directory

All audio files should be saved to `./outputs/` (the default output directory for Claude Code).

```bash
mkdir -p ./outputs
say -v Samantha -o ./outputs/speech.aiff "Your text here"
```

## Notes

- The `say` command is built-in to macOS and requires no installation.
- Premium/enhanced voices produce higher quality output but take more storage space.
- To download additional voices: System Settings > Accessibility > Spoken Content > System Voice > Manage Voices.
- Audio file output does not play the speech aloud simultaneously.
- For long texts, using a file with `-f` is recommended over inline text.
- The `say` command supports SSML-like inline commands for fine-grained control.
