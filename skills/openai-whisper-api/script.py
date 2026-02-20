#!/usr/bin/env python3
"""
OpenAI Whisper API 音声文字起こしスクリプト
音声ファイルをテキストに変換し、./outputs/ に保存します。
"""

import os
import sys
import argparse
import requests
from datetime import datetime


def transcribe_audio(audio_file, language=None, response_format="text",
                     timestamps=False, output_filename="transcript.txt", prompt=None):
    """Whisper APIで音声を文字起こしする"""

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY environment variable is not set.", file=sys.stderr)
        print("Please add 'openai_api_key: YOUR_KEY' to ~/.claude/env.yaml", file=sys.stderr)
        sys.exit(1)

    # 音声ファイルの存在確認
    if not os.path.isfile(audio_file):
        print(f"ERROR: Audio file not found: {audio_file}", file=sys.stderr)
        sys.exit(1)

    # ファイルサイズチェック (25MB制限)
    file_size = os.path.getsize(audio_file)
    if file_size > 25 * 1024 * 1024:
        print(f"ERROR: File size ({file_size / 1024 / 1024:.1f}MB) exceeds 25MB limit.", file=sys.stderr)
        sys.exit(1)

    # 出力ディレクトリの作成
    output_dir = os.environ.get("OUTPUT_DIR", "./outputs")
    os.makedirs(output_dir, exist_ok=True)

    # タイムスタンプが要求された場合はverbose_jsonを使用
    actual_format = response_format
    if timestamps and response_format == "text":
        actual_format = "verbose_json"

    # API呼び出し
    url = "https://api.openai.com/v1/audio/transcriptions"
    headers = {
        "Authorization": f"Bearer {api_key}"
    }

    data = {
        "model": "whisper-1",
        "response_format": actual_format
    }

    if language:
        data["language"] = language

    if prompt:
        data["prompt"] = prompt

    if timestamps and actual_format == "verbose_json":
        data["timestamp_granularities[]"] = "segment"

    print(f"Transcribing: {audio_file}")
    print(f"File size: {file_size / 1024 / 1024:.1f}MB")
    if language:
        print(f"Language: {language}")

    try:
        with open(audio_file, "rb") as f:
            files = {"file": (os.path.basename(audio_file), f)}
            response = requests.post(url, headers=headers, data=data, files=files, timeout=300)
            response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        error_detail = ""
        try:
            error_detail = response.json().get("error", {}).get("message", "")
        except Exception:
            pass
        print(f"ERROR: API request failed: {e}", file=sys.stderr)
        if error_detail:
            print(f"Detail: {error_detail}", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Request failed: {e}", file=sys.stderr)
        sys.exit(1)

    # レスポンス処理
    if actual_format in ("json", "verbose_json"):
        result = response.json()
        transcript_text = result.get("text", "")

        # タイムスタンプ付き出力
        if timestamps and "segments" in result:
            lines = []
            for seg in result["segments"]:
                start = seg.get("start", 0)
                end = seg.get("end", 0)
                text = seg.get("text", "").strip()
                start_min, start_sec = divmod(int(start), 60)
                end_min, end_sec = divmod(int(end), 60)
                lines.append(f"[{start_min:02d}:{start_sec:02d} - {end_min:02d}:{end_sec:02d}] {text}")
            output_text = "\n".join(lines)
        else:
            output_text = transcript_text
    elif actual_format in ("srt", "vtt"):
        output_text = response.text
    else:
        output_text = response.text

    # 出力ファイルの保存
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name, ext = os.path.splitext(output_filename)
    if not ext:
        ext_map = {"srt": ".srt", "vtt": ".vtt", "json": ".json", "verbose_json": ".json"}
        ext = ext_map.get(actual_format, ".txt")
    final_filename = f"{name}_{timestamp}{ext}"
    output_path = os.path.join(output_dir, final_filename)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output_text)

    print(f"\nTranscription saved: {output_path}")
    print(f"\n--- Transcript ---")
    print(output_text[:2000])
    if len(output_text) > 2000:
        print(f"\n... (truncated, full text in {output_path})")

    return output_path


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio using OpenAI Whisper API")
    parser.add_argument("audio_file", help="Path to audio file (mp3, wav, m4a, etc.)")
    parser.add_argument("--language", default=None,
                        help="Language code (e.g., ja, en, zh). Auto-detected if not specified.")
    parser.add_argument("--format", dest="response_format", default="text",
                        choices=["text", "json", "srt", "vtt", "verbose_json"],
                        help="Output format (default: text)")
    parser.add_argument("--timestamps", action="store_true",
                        help="Include timestamps in output")
    parser.add_argument("--output", default="transcript.txt",
                        help="Output filename (default: transcript.txt)")
    parser.add_argument("--prompt", default=None,
                        help="Optional prompt to guide transcription")

    args = parser.parse_args()
    transcribe_audio(args.audio_file, args.language, args.response_format,
                     args.timestamps, args.output, args.prompt)


if __name__ == "__main__":
    main()
