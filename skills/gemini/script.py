#!/usr/bin/env python3
"""
Google Gemini API スクリプト
テキストや画像に対するクエリをGemini APIで実行します。
"""

import os
import sys
import argparse
import requests
import base64
import json
from datetime import datetime


def query_gemini(prompt, image_path=None, image_url=None, model="gemini-2.0-flash",
                 output_filename=None, max_tokens=8192, temperature=1.0):
    """Gemini APIにクエリを送信する"""

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY environment variable is not set.", file=sys.stderr)
        print("Please add 'gemini_api_key: YOUR_KEY' to ~/.claude/env.yaml", file=sys.stderr)
        sys.exit(1)

    # API URL
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    # リクエストの構築
    parts = []

    # テキストパート
    parts.append({"text": prompt})

    # 画像パート（ローカルファイル）
    if image_path:
        if not os.path.isfile(image_path):
            print(f"ERROR: Image file not found: {image_path}", file=sys.stderr)
            sys.exit(1)

        # MIME typeの判定
        ext = os.path.splitext(image_path)[1].lower()
        mime_map = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".gif": "image/gif",
            ".webp": "image/webp", ".bmp": "image/bmp"
        }
        mime_type = mime_map.get(ext, "image/jpeg")

        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        parts.append({
            "inline_data": {
                "mime_type": mime_type,
                "data": image_data
            }
        })

    # 画像パート（URL）
    if image_url:
        try:
            img_response = requests.get(image_url, timeout=30)
            img_response.raise_for_status()
            content_type = img_response.headers.get("Content-Type", "image/jpeg")
            image_data = base64.b64encode(img_response.content).decode("utf-8")
            parts.append({
                "inline_data": {
                    "mime_type": content_type.split(";")[0],
                    "data": image_data
                }
            })
        except requests.exceptions.RequestException as e:
            print(f"ERROR: Failed to download image: {e}", file=sys.stderr)
            sys.exit(1)

    payload = {
        "contents": [
            {
                "parts": parts
            }
        ],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": temperature
        }
    }

    headers = {
        "Content-Type": "application/json"
    }

    print(f"Model: {model}", file=sys.stderr)
    if image_path:
        print(f"Image: {image_path}", file=sys.stderr)
    if image_url:
        print(f"Image URL: {image_url}", file=sys.stderr)

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=120)
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        error_detail = ""
        try:
            error_body = response.json()
            error_detail = error_body.get("error", {}).get("message", "")
        except Exception:
            pass
        print(f"ERROR: API request failed: {e}", file=sys.stderr)
        if error_detail:
            print(f"Detail: {error_detail}", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Request failed: {e}", file=sys.stderr)
        sys.exit(1)

    data = response.json()

    # レスポンスからテキストを抽出
    try:
        candidates = data.get("candidates", [])
        if not candidates:
            print("ERROR: No response candidates returned.", file=sys.stderr)
            print(f"Response: {json.dumps(data, indent=2)}", file=sys.stderr)
            sys.exit(1)

        content = candidates[0].get("content", {})
        text_parts = content.get("parts", [])
        result_text = ""
        for part in text_parts:
            if "text" in part:
                result_text += part["text"]
    except (KeyError, IndexError) as e:
        print(f"ERROR: Failed to parse response: {e}", file=sys.stderr)
        print(f"Response: {json.dumps(data, indent=2)}", file=sys.stderr)
        sys.exit(1)

    # 使用量情報
    usage = data.get("usageMetadata", {})
    prompt_tokens = usage.get("promptTokenCount", 0)
    output_tokens = usage.get("candidatesTokenCount", 0)
    print(f"Tokens - prompt: {prompt_tokens}, output: {output_tokens}", file=sys.stderr)

    # 結果を標準出力に表示
    print(result_text)

    # ファイルに保存
    if output_filename:
        output_dir = os.environ.get("OUTPUT_DIR", "./outputs")
        os.makedirs(output_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        name, ext = os.path.splitext(output_filename)
        if not ext:
            ext = ".txt"
        final_filename = f"{name}_{timestamp}{ext}"
        output_path = os.path.join(output_dir, final_filename)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(result_text)

        print(f"\nResult saved: {output_path}", file=sys.stderr)

    return result_text


def main():
    parser = argparse.ArgumentParser(description="Query Google Gemini API")
    parser.add_argument("prompt", help="Text prompt")
    parser.add_argument("--image", default=None,
                        help="Local image file path")
    parser.add_argument("--image-url", default=None,
                        help="Image URL")
    parser.add_argument("--model", default="gemini-2.0-flash",
                        help="Model name (default: gemini-2.0-flash)")
    parser.add_argument("--output", default=None,
                        help="Output filename (saved to ./outputs/)")
    parser.add_argument("--max-tokens", type=int, default=8192,
                        help="Maximum output tokens (default: 8192)")
    parser.add_argument("--temperature", type=float, default=1.0,
                        help="Temperature parameter 0.0-2.0 (default: 1.0)")

    args = parser.parse_args()
    query_gemini(args.prompt, args.image, args.image_url, args.model,
                 args.output, args.max_tokens, args.temperature)


if __name__ == "__main__":
    main()
