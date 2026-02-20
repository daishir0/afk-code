#!/usr/bin/env python3
"""
Trello REST API スクリプト
ボード、リスト、カードの操作を行います。
"""

import os
import sys
import argparse
import requests
import json
from datetime import datetime

TRELLO_BASE_URL = "https://api.trello.com/1"


def get_auth_params():
    """Trello API認証パラメータを取得"""
    api_key = os.environ.get("TRELLO_KEY")
    token = os.environ.get("TRELLO_TOKEN")

    if not api_key:
        print("ERROR: TRELLO_KEY environment variable is not set.", file=sys.stderr)
        print("Please add 'trello_key: YOUR_KEY' to ~/.claude/env.yaml", file=sys.stderr)
        sys.exit(1)

    if not token:
        print("ERROR: TRELLO_TOKEN environment variable is not set.", file=sys.stderr)
        print("Please add 'trello_token: YOUR_TOKEN' to ~/.claude/env.yaml", file=sys.stderr)
        sys.exit(1)

    return {"key": api_key, "token": token}


def api_request(method, endpoint, params=None, data=None):
    """Trello APIリクエストを送信"""
    url = f"{TRELLO_BASE_URL}{endpoint}"
    auth = get_auth_params()

    if params is None:
        params = {}
    params.update(auth)

    try:
        if method == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method == "POST":
            response = requests.post(url, params=params, json=data, timeout=30)
        elif method == "PUT":
            response = requests.put(url, params=params, json=data, timeout=30)
        elif method == "DELETE":
            response = requests.delete(url, params=params, timeout=30)
        else:
            print(f"ERROR: Unsupported method: {method}", file=sys.stderr)
            sys.exit(1)

        response.raise_for_status()

        if response.text:
            return response.json()
        return {}

    except requests.exceptions.HTTPError as e:
        error_detail = ""
        try:
            error_detail = response.text
        except Exception:
            pass
        print(f"ERROR: API request failed: {e}", file=sys.stderr)
        if error_detail:
            print(f"Detail: {error_detail}", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Request failed: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_list_boards(output=None):
    """自分のボード一覧を取得"""
    result = api_request("GET", "/members/me/boards", {"fields": "name,desc,url,dateLastActivity"})

    print(f"Found {len(result)} boards:\n")
    for board in result:
        print(f"  {board.get('name', '(no name)')}")
        print(f"    ID: {board.get('id', '')}")
        print(f"    URL: {board.get('url', '')}")
        desc = board.get("desc", "")
        if desc:
            print(f"    Desc: {desc[:80]}")
        print()

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_get_board(board_id, output=None):
    """ボードの詳細を取得"""
    result = api_request("GET", f"/boards/{board_id}", {
        "fields": "name,desc,url,dateLastActivity",
        "lists": "open",
        "list_fields": "name,pos",
        "cards": "visible",
        "card_fields": "name,desc,idList,due,labels"
    })

    print(f"Board: {result.get('name', '')}")
    print(f"URL: {result.get('url', '')}")
    print(f"Description: {result.get('desc', '')}")

    lists = result.get("lists", [])
    cards = result.get("cards", [])

    # リストごとにカードを表示
    for lst in lists:
        list_id = lst.get("id")
        list_name = lst.get("name", "(no name)")
        list_cards = [c for c in cards if c.get("idList") == list_id]

        print(f"\n--- {list_name} ({len(list_cards)} cards) ---")
        for card in list_cards:
            print(f"  [{card.get('id', '')[:8]}] {card.get('name', '')}")
            due = card.get("due")
            if due:
                print(f"    Due: {due}")
            labels = card.get("labels", [])
            if labels:
                label_names = [l.get("name", l.get("color", "")) for l in labels]
                print(f"    Labels: {', '.join(label_names)}")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_list_lists(board_id, output=None):
    """ボード内のリスト一覧を取得"""
    result = api_request("GET", f"/boards/{board_id}/lists", {"fields": "name,pos,closed"})

    print(f"Lists in board:\n")
    for lst in result:
        status = " (archived)" if lst.get("closed") else ""
        print(f"  {lst.get('name', '(no name)')}{status}")
        print(f"    ID: {lst.get('id', '')}")
        print()

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_create_list(board_id, name, output=None):
    """リストを作成"""
    result = api_request("POST", "/lists", {"name": name, "idBoard": board_id})

    print(f"List created: {result.get('name', '')}")
    print(f"List ID: {result.get('id', '')}")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_list_cards(list_id, output=None):
    """リスト内のカード一覧を取得"""
    result = api_request("GET", f"/lists/{list_id}/cards", {
        "fields": "name,desc,due,labels,dateLastActivity,pos"
    })

    print(f"Found {len(result)} cards:\n")
    for card in result:
        print(f"  {card.get('name', '(no name)')}")
        print(f"    ID: {card.get('id', '')}")
        desc = card.get("desc", "")
        if desc:
            print(f"    Desc: {desc[:80]}")
        due = card.get("due")
        if due:
            print(f"    Due: {due}")
        labels = card.get("labels", [])
        if labels:
            label_names = [l.get("name", l.get("color", "")) for l in labels]
            print(f"    Labels: {', '.join(label_names)}")
        print()

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_create_card(list_id, name, desc="", output=None):
    """カードを作成"""
    params = {"name": name, "idList": list_id}
    if desc:
        params["desc"] = desc

    result = api_request("POST", "/cards", params)

    print(f"Card created: {result.get('name', '')}")
    print(f"Card ID: {result.get('id', '')}")
    print(f"URL: {result.get('url', '')}")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_update_card(card_id, name=None, desc=None, due=None, output=None):
    """カードを更新"""
    params = {}
    if name:
        params["name"] = name
    if desc is not None:
        params["desc"] = desc
    if due:
        params["due"] = due

    if not params:
        print("ERROR: No update parameters specified.", file=sys.stderr)
        sys.exit(1)

    result = api_request("PUT", f"/cards/{card_id}", params)

    print(f"Card updated: {result.get('name', '')}")
    print(f"URL: {result.get('url', '')}")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_move_card(card_id, target_list_id, output=None):
    """カードを別リストに移動"""
    result = api_request("PUT", f"/cards/{card_id}", {"idList": target_list_id})

    print(f"Card moved: {result.get('name', '')}")
    print(f"New list: {target_list_id}")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_add_comment(card_id, text, output=None):
    """カードにコメントを追加"""
    result = api_request("POST", f"/cards/{card_id}/actions/comments", {"text": text})

    print(f"Comment added to card: {card_id}")
    print(f"Comment: {text[:100]}")

    if output:
        save_output(json.dumps(result, indent=2, ensure_ascii=False), output)

    return result


def cmd_delete_card(card_id, output=None):
    """カードを削除"""
    result = api_request("DELETE", f"/cards/{card_id}")

    print(f"Card deleted: {card_id}")

    if output:
        save_output(json.dumps({"deleted": card_id}, indent=2), output)

    return result


def save_output(text, filename):
    """結果をファイルに保存"""
    output_dir = os.environ.get("OUTPUT_DIR", "./outputs")
    os.makedirs(output_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name, ext = os.path.splitext(filename)
    if not ext:
        ext = ".json"
    final_filename = f"{name}_{timestamp}{ext}"
    output_path = os.path.join(output_dir, final_filename)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text)

    print(f"\nResult saved: {output_path}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Trello API operations")
    parser.add_argument("--output", default=None, help="Output filename (saved to ./outputs/)")

    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # list-boards
    subparsers.add_parser("list-boards", help="List your boards")

    # get-board
    sp = subparsers.add_parser("get-board", help="Get board details")
    sp.add_argument("board_id", help="Board ID")

    # list-lists
    sp = subparsers.add_parser("list-lists", help="List board's lists")
    sp.add_argument("board_id", help="Board ID")

    # create-list
    sp = subparsers.add_parser("create-list", help="Create a new list")
    sp.add_argument("board_id", help="Board ID")
    sp.add_argument("name", help="List name")

    # list-cards
    sp = subparsers.add_parser("list-cards", help="List cards in a list")
    sp.add_argument("list_id", help="List ID")

    # create-card
    sp = subparsers.add_parser("create-card", help="Create a new card")
    sp.add_argument("list_id", help="List ID")
    sp.add_argument("name", help="Card name")
    sp.add_argument("desc", nargs="?", default="", help="Card description")

    # update-card
    sp = subparsers.add_parser("update-card", help="Update a card")
    sp.add_argument("card_id", help="Card ID")
    sp.add_argument("--name", default=None, help="New card name")
    sp.add_argument("--desc", default=None, help="New description")
    sp.add_argument("--due", default=None, help="Due date (ISO 8601)")

    # move-card
    sp = subparsers.add_parser("move-card", help="Move card to another list")
    sp.add_argument("card_id", help="Card ID")
    sp.add_argument("target_list_id", help="Target list ID")

    # add-comment
    sp = subparsers.add_parser("add-comment", help="Add comment to card")
    sp.add_argument("card_id", help="Card ID")
    sp.add_argument("text", help="Comment text")

    # delete-card
    sp = subparsers.add_parser("delete-card", help="Delete a card")
    sp.add_argument("card_id", help="Card ID")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "list-boards": lambda: cmd_list_boards(args.output),
        "get-board": lambda: cmd_get_board(args.board_id, args.output),
        "list-lists": lambda: cmd_list_lists(args.board_id, args.output),
        "create-list": lambda: cmd_create_list(args.board_id, args.name, args.output),
        "list-cards": lambda: cmd_list_cards(args.list_id, args.output),
        "create-card": lambda: cmd_create_card(args.list_id, args.name, getattr(args, "desc", ""), args.output),
        "update-card": lambda: cmd_update_card(args.card_id, getattr(args, "name", None),
                                                getattr(args, "desc", None), getattr(args, "due", None), args.output),
        "move-card": lambda: cmd_move_card(args.card_id, args.target_list_id, args.output),
        "add-comment": lambda: cmd_add_comment(args.card_id, args.text, args.output),
        "delete-card": lambda: cmd_delete_card(args.card_id, args.output),
    }

    commands[args.command]()


if __name__ == "__main__":
    main()
