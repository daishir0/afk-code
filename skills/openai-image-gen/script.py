#!/usr/bin/env python3
"""
OpenAI DALL-E 画像生成スクリプト
テキストプロンプトから画像を生成し、./outputs/ に保存します。
"""

import os
import sys
import argparse
import requests
import base64
from datetime import datetime


def generate_image(prompt, size="1024x1024", model="dall-e-3", quality="standard", output_filename="generated_image.png"):
    """DALL-E APIで画像を生成し保存する"""

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY environment variable is not set.", file=sys.stderr)
        print("Please add 'openai_api_key: YOUR_KEY' to ~/.claude/env.yaml", file=sys.stderr)
        sys.exit(1)

    # 出力ディレクトリの作成
    output_dir = os.environ.get("OUTPUT_DIR", "./outputs")
    os.makedirs(output_dir, exist_ok=True)

    # API呼び出し
    url = "https://api.openai.com/v1/images/generations"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "response_format": "b64_json"
    }

    # dall-e-3のみqualityパラメータをサポート
    if model == "dall-e-3":
        payload["quality"] = quality

    print(f"Generating image with {model}...")
    print(f"Prompt: {prompt}")
    print(f"Size: {size}, Quality: {quality}")

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=120)
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

    data = response.json()

    # 画像データの取得とデコード
    image_b64 = data["data"][0]["b64_json"]
    image_bytes = base64.b64decode(image_b64)

    # revised_promptがあれば表示（dall-e-3の場合）
    revised_prompt = data["data"][0].get("revised_prompt")
    if revised_prompt:
        print(f"Revised prompt: {revised_prompt}")

    # タイムスタンプ付きファイル名の生成
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name, ext = os.path.splitext(output_filename)
    if not ext:
        ext = ".png"
    final_filename = f"{name}_{timestamp}{ext}"
    output_path = os.path.join(output_dir, final_filename)

    # 画像の保存
    with open(output_path, "wb") as f:
        f.write(image_bytes)

    print(f"Image saved: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Generate images using OpenAI DALL-E API")
    parser.add_argument("prompt", help="Image generation prompt (English recommended)")
    parser.add_argument("--size", default="1024x1024",
                        choices=["1024x1024", "1024x1792", "1792x1024", "256x256", "512x512"],
                        help="Image size (default: 1024x1024)")
    parser.add_argument("--model", default="dall-e-3",
                        choices=["dall-e-2", "dall-e-3"],
                        help="Model to use (default: dall-e-3)")
    parser.add_argument("--quality", default="standard",
                        choices=["standard", "hd"],
                        help="Image quality, dall-e-3 only (default: standard)")
    parser.add_argument("--output", default="generated_image.png",
                        help="Output filename (default: generated_image.png)")

    args = parser.parse_args()
    generate_image(args.prompt, args.size, args.model, args.quality, args.output)


if __name__ == "__main__":
    main()
