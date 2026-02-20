#!/usr/bin/env python3
"""
Notion API スクリプト
ページの読み取り、作成、更新、検索を行います。
"""

import os
import sys
import argparse
import requests
import json
from datetime import datetime

NOTION_API_VERSION = "2022-06-28"
NOTION_BASE_URL = "https://api.notion.com/v1"


def get_headers():
    """Notion API用ヘッダーを取得"""
    token = os.environ.get("NOTION_TOKEN")
    if not token:
        print("ERROR: NOTION_TOKEN environment variable is not set.", file=sys.stderr)
        print("Please add 'notion_token: YOUR_TOKEN' to ~/.claude/env.yaml", file=sys.stderr)
        sys.exit(1)

    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Notion-Version": NOTION_API_VERSION
    }


def api_request(method, endpoint, data=None):
    """Notion APIリクエストを送信"""
    url = f"{NOTION_BASE_URL}{endpoint}"
    headers = get_headers()

    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data, timeout=30)
        elif method == "PATCH":
            response = requests.patch(url, headers=headers, json=data, timeout=30)
        else:
            print(f"ERROR: Unsupported method: {method}", file=sys.stderr)
            sys.exit(1)

        response.raise_for_status()
        return response.json()

    except requests.exceptions.HTTPError as e:
        error_detail = ""
        try:
            error_body = response.json()
            error_detail = error_body.get("message", "")
        except Exception:
            pass
        print(f"ERROR: API request failed: {e}", file=sys.stderr)
        if error_detail:
            print(f"Detail: {error_detail}", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


def extract_text_from_rich_text(rich_text_list):
    """rich_textリストからテキストを抽出"""
    return "".join([rt.get("plain_text", "") for rt in rich_text_list])


def extract_title_from_properties(properties):
    """プロパティからタイトルを抽出"""
    for key, value in properties.items():
        if value.get("type") == "title":
            title_list = value.get("title", [])
            return extract_text_from_rich_text(title_list)
    return "(no title)"


def blocks_to_text(blocks):
    """ブロックリストをテキストに変換"""
    lines = []
    for block in blocks:
        block_type = block.get("type", "unknown")

        if block_type == "paragraph":
            text = extract_text_from_rich_text(block.get("paragraph", {}).get("rich_text", []))
            lines.append(text)

        elif block_type.startswith("heading_"):
            level = block_type[-1]
            text = extract_text_from_rich_text(block.get(block_type, {}).get("rich_text", []))
            lines.append(f"{'#' * int(level)} {text}")

        elif block_type == "bulleted_list_item":
            text = extract_text_from_rich_text(block.get("bulleted_list_item", {}).get("rich_text", []))
            lines.append(f"- {text}")

        elif block_type == "numbered_list_item":
            text = extract_text_from_rich_text(block.get("numbered_list_item", {}).get("rich_text", []))
            lines.append(f"1. {text}")

        elif block_type == "to_do":
            checked = block.get("to_do", {}).get("checked", False)
            text = extract_text_from_rich_text(block.get("to_do", {}).get("rich_text", []))
            checkbox = "[x]" if checked else "[ ]"
            lines.append(f"- {checkbox} {text}")

        elif block_type == "code":
            text = extract_text_from_rich_text(block.get("code", {}).get("rich_text", []))
            lang = block.get("code", {}).get("language", "")
            lines.append(f"```{lang}\n{text}\n```")

        elif block_type == "quote":
            text = extract_text_from_rich_text(block.get("quote", {}).get("rich_text", []))
            lines.append(f"> {text}")

        elif block_type == "divider":
            lines.append("---")

        elif block_type == "toggle":
            text = extract_text_from_rich_text(block.get("toggle", {}).get("rich_text", []))
            lines.append(f"<details><summary>{text}</summary></details>")

        elif block_type == "callout":
            text = extract_text_from_rich_text(block.get("callout", {}).get("rich_text", []))
            icon = block.get("callout", {}).get("icon", {}).get("emoji", "")
            lines.append(f"{icon} {text}")

        else:
            lines.append(f"[{block_type}]")

        lines.append("")

    return "\n".join(lines)


def cmd_get_page(page_id, output=None):
    """ページのプロパティを取得"""
    result = api_request("GET", f"/pages/{page_id}")

    title = extract_title_from_properties(result.get("properties", {}))
    print(f"Title: {title}")
    print(f"URL: {result.get('url', '')}")
    print(f"Created: {result.get('created_time', '')}")
    print(f"Updated: {result.get('last_edited_time', '')}")
    print(f"\nProperties:")
    print(json.dumps(result.get("properties", {}), indent=2, ensure_ascii=False))

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_get_blocks(page_id, output=None):
    """ページのブロック内容を取得"""
    all_blocks = []
    cursor = None

    while True:
        endpoint = f"/blocks/{page_id}/children"
        if cursor:
            endpoint += f"?start_cursor={cursor}"

        result = api_request("GET", endpoint)
        blocks = result.get("results", [])
        all_blocks.extend(blocks)

        if not result.get("has_more", False):
            break
        cursor = result.get("next_cursor")

    text = blocks_to_text(all_blocks)
    print(text)

    if output:
        save_output(text, output)

    return all_blocks


def cmd_search(query, filter_type=None, output=None):
    """ワークスペース内を検索"""
    data = {"query": query}

    if filter_type:
        data["filter"] = {"property": "object", "value": filter_type}

    result = api_request("POST", "/search", data)
    results = result.get("results", [])

    print(f"Found {len(results)} results:\n")

    for item in results:
        obj_type = item.get("object", "unknown")
        item_id = item.get("id", "")

        if obj_type == "page":
            title = extract_title_from_properties(item.get("properties", {}))
            url = item.get("url", "")
            print(f"[Page] {title}")
            print(f"  ID: {item_id}")
            print(f"  URL: {url}")
        elif obj_type == "database":
            title_list = item.get("title", [])
            title = extract_text_from_rich_text(title_list)
            url = item.get("url", "")
            print(f"[Database] {title}")
            print(f"  ID: {item_id}")
            print(f"  URL: {url}")

        print()

    if output:
        save_output(json.dumps(results, indent=2, ensure_ascii=False), output)

    return results


def cmd_create_page(parent_id, title, body="", output=None):
    """新規ページを作成"""
    children = []
    if body:
        # テキストを段落ブロックに分割
        for paragraph in body.split("\n\n"):
            if paragraph.strip():
                children.append({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"type": "text", "text": {"content": paragraph.strip()}}]
                    }
                })

    data = {
        "parent": {"page_id": parent_id},
        "properties": {
            "title": {
                "title": [{"type": "text", "text": {"content": title}}]
            }
        },
        "children": children
    }

    result = api_request("POST", "/pages", data)
    print(f"Page created: {result.get('url', '')}")
    print(f"Page ID: {result.get('id', '')}")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_create_db_item(database_id, title, body="", output=None):
    """データベースにアイテムを追加"""
    children = []
    if body:
        for paragraph in body.split("\n\n"):
            if paragraph.strip():
                children.append({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"type": "text", "text": {"content": paragraph.strip()}}]
                    }
                })

    data = {
        "parent": {"database_id": database_id},
        "properties": {
            "Name": {
                "title": [{"type": "text", "text": {"content": title}}]
            }
        },
        "children": children
    }

    result = api_request("POST", "/pages", data)
    print(f"Item created: {result.get('url', '')}")
    print(f"Item ID: {result.get('id', '')}")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_append_block(page_id, text, output=None):
    """ページにテキストブロックを追加"""
    children = []
    for paragraph in text.split("\n\n"):
        if paragraph.strip():
            children.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": paragraph.strip()}}]
                }
            })

    data = {"children": children}
    result = api_request("PATCH", f"/blocks/{page_id}/children", data)
    print(f"Blocks appended to page: {page_id}")
    print(f"Added {len(children)} block(s)")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_update_title(page_id, new_title, output=None):
    """ページタイトルを更新"""
    data = {
        "properties": {
            "title": {
                "title": [{"type": "text", "text": {"content": new_title}}]
            }
        }
    }

    result = api_request("PATCH", f"/pages/{page_id}", data)
    print(f"Title updated: {new_title}")
    print(f"URL: {result.get('url', '')}")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_query_db(database_id, output=None):
    """データベースをクエリ"""
    all_results = []
    cursor = None

    while True:
        data = {}
        if cursor:
            data["start_cursor"] = cursor

        result = api_request("POST", f"/databases/{database_id}/query", data)
        items = result.get("results", [])
        all_results.extend(items)

        if not result.get("has_more", False):
            break
        cursor = result.get("next_cursor")

    print(f"Found {len(all_results)} items:\n")

    for item in all_results:
        title = extract_title_from_properties(item.get("properties", {}))
        item_id = item.get("id", "")
        url = item.get("url", "")
        print(f"  {title}")
        print(f"    ID: {item_id}")
        print(f"    URL: {url}")
        print()

    if output:
        save_output(json.dumps(all_results, indent=2, ensure_ascii=False), output)

    return all_results


def save_output(text, filename):
    """結果をファイルに保存"""
    output_dir = os.environ.get("OUTPUT_DIR", "./outputs")
    os.makedirs(output_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name, ext = os.path.splitext(filename)
    if not ext:
        ext = ".txt"
    final_filename = f"{name}_{timestamp}{ext}"
    output_path = os.path.join(output_dir, final_filename)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text)

    print(f"\nResult saved: {output_path}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Notion API operations")
    parser.add_argument("--output", default=None, help="Output filename (saved to ./outputs/)")

    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # get-page
    sp = subparsers.add_parser("get-page", help="Get page properties")
    sp.add_argument("page_id", help="Page ID")

    # get-blocks
    sp = subparsers.add_parser("get-blocks", help="Get page block contents")
    sp.add_argument("page_id", help="Page ID")

    # search
    sp = subparsers.add_parser("search", help="Search workspace")
    sp.add_argument("query", help="Search query")
    sp.add_argument("--filter", choices=["page", "database"], default=None,
                    help="Filter by object type")

    # create-page
    sp = subparsers.add_parser("create-page", help="Create a new page")
    sp.add_argument("parent_id", help="Parent page ID")
    sp.add_argument("title", help="Page title")
    sp.add_argument("body", nargs="?", default="", help="Page body text")

    # create-db-item
    sp = subparsers.add_parser("create-db-item", help="Add item to database")
    sp.add_argument("database_id", help="Database ID")
    sp.add_argument("title", help="Item title")
    sp.add_argument("body", nargs="?", default="", help="Item body text")

    # append-block
    sp = subparsers.add_parser("append-block", help="Append text block to page")
    sp.add_argument("page_id", help="Page ID")
    sp.add_argument("text", help="Text to append")

    # update-title
    sp = subparsers.add_parser("update-title", help="Update page title")
    sp.add_argument("page_id", help="Page ID")
    sp.add_argument("title", help="New title")

    # query-db
    sp = subparsers.add_parser("query-db", help="Query database")
    sp.add_argument("database_id", help="Database ID")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "get-page": lambda: cmd_get_page(args.page_id, args.output),
        "get-blocks": lambda: cmd_get_blocks(args.page_id, args.output),
        "search": lambda: cmd_search(args.query, getattr(args, "filter", None), args.output),
        "create-page": lambda: cmd_create_page(args.parent_id, args.title, args.body, args.output),
        "create-db-item": lambda: cmd_create_db_item(args.database_id, args.title, args.body, args.output),
        "append-block": lambda: cmd_append_block(args.page_id, args.text, args.output),
        "update-title": lambda: cmd_update_title(args.page_id, args.title, args.output),
        "query-db": lambda: cmd_query_db(args.database_id, args.output),
    }

    commands[args.command]()


if __name__ == "__main__":
    main()
