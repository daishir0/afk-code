#!/usr/bin/env python3
"""WeatherNews APIから天気情報を取得し、服装提案付きで表示するスクリプト"""

import sys
import json
import urllib.request
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))

# 都市座標マッピング
CITIES = {
    "東京": (35.6762, 139.6503),
    "tokyo": (35.6762, 139.6503),
    "大阪": (34.6937, 135.5023),
    "osaka": (34.6937, 135.5023),
    "名古屋": (35.1815, 136.9066),
    "nagoya": (35.1815, 136.9066),
    "福岡": (33.5904, 130.4017),
    "fukuoka": (33.5904, 130.4017),
    "札幌": (43.0621, 141.3544),
    "sapporo": (43.0621, 141.3544),
    "横浜": (35.4437, 139.6380),
    "yokohama": (35.4437, 139.6380),
    "京都": (35.0116, 135.7681),
    "kyoto": (35.0116, 135.7681),
    "神戸": (34.6901, 135.1956),
    "kobe": (34.6901, 135.1956),
    "仙台": (38.2682, 140.8694),
    "sendai": (38.2682, 140.8694),
    "広島": (34.3853, 132.4553),
    "hiroshima": (34.3853, 132.4553),
    "那覇": (26.3344, 127.7675),
    "naha": (26.3344, 127.7675),
}

# 天気コード → 日本語マッピング
WX_MAP = {
    100: ("晴れ", "☀️"),
    101: ("晴れ時々曇り", "🌤"),
    102: ("晴れ一時雨", "🌦"),
    103: ("晴れ時々雨", "🌦"),
    104: ("晴れ一時雪", "🌨"),
    200: ("曇り", "☁️"),
    201: ("曇り時々晴れ", "⛅"),
    202: ("曇り一時雨", "🌧"),
    203: ("曇り時々雨", "🌧"),
    204: ("曇り一時雪", "🌨"),
    300: ("雨", "🌧"),
    301: ("雨時々曇り", "🌧"),
    302: ("大雨", "⛈"),
    303: ("雨時々雪", "🌨"),
    311: ("暴風雨", "⛈"),
    400: ("雪", "❄️"),
    401: ("雪時々曇り", "🌨"),
    402: ("大雪", "❄️"),
    403: ("雪時々雨", "🌨"),
    430: ("吹雪", "🌬❄️"),
}

# 風向き (1-16)
WIND_DIRS = [
    "", "北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東",
    "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"
]

API_URL = "https://site.weathernews.jp/lba/wxdata/api_data_ss1"


def get_wx_text(code):
    """天気コードから日本語テキストとアイコンを取得"""
    if code in WX_MAP:
        return WX_MAP[code]
    # 近いコードで推測
    base = (code // 100) * 100
    if base in WX_MAP:
        return WX_MAP[base]
    return ("不明", "❓")


def get_wind_dir(code):
    """風向きコードから方角を取得"""
    if 1 <= code <= 16:
        return WIND_DIRS[code]
    return "不定"


def get_clothing_advice(max_temp, min_temp, wx_code, wind_speed):
    """気温・天候・風速から服装提案を生成"""
    advice = []
    # 体感温度の参考値（風速考慮）
    feel_temp = max_temp - (wind_speed * 0.5) if wind_speed > 3 else max_temp

    if feel_temp >= 28:
        advice.append("半袖・短パンでOK。通気性の良い素材がおすすめ")
        advice.append("帽子やサングラスで日差し対策を")
    elif feel_temp >= 23:
        advice.append("半袖か薄手の長袖シャツ1枚で快適")
        advice.append("室内の冷房対策に薄手のカーディガンがあると安心")
    elif feel_temp >= 18:
        advice.append("長袖シャツ＋薄手のジャケットやカーディガン")
        advice.append("朝晩は少し肌寒いので羽織ものを持ち歩くと良い")
    elif feel_temp >= 13:
        advice.append("セーターやニット＋ジャケット")
        advice.append("朝晩の冷え込みに備えて重ね着がおすすめ")
    elif feel_temp >= 8:
        advice.append("コート必須。セーター＋厚手アウター")
        advice.append("マフラーや手袋があると快適")
    elif feel_temp >= 3:
        advice.append("厚手のコート＋マフラー＋手袋")
        advice.append("ヒートテックなどインナーで防寒を")
    else:
        advice.append("防寒対策を万全に！ダウンコート＋マフラー＋手袋＋帽子")
        advice.append("カイロや暖かいインナーも必須")

    # 雨対策
    if wx_code >= 300 and wx_code < 400:
        advice.append("傘を忘れずに！足元は撥水性のある靴がおすすめ")
    elif wx_code in (102, 103, 202, 203):
        advice.append("にわか雨の可能性あり。折りたたみ傘を携帯して")
    elif wx_code >= 400:
        advice.append("雪対策！滑りにくい靴と防水アウターで")

    # 風が強い場合
    if wind_speed >= 7:
        advice.append("強風注意！髪の乱れや体感温度の低下に注意")

    # 寒暖差
    diff = max_temp - min_temp
    if diff >= 10:
        advice.append(f"寒暖差{diff:.0f}℃！脱ぎ着しやすい服装で調整を")

    return advice


def fetch_weather(city_name="東京"):
    """天気情報を取得して整形済みテキストを返す"""
    key = city_name.lower().strip()
    if key not in CITIES:
        # ひらがな/カタカナ対応は省略、キー一覧を表示
        available = ", ".join(sorted(set(
            k for k in CITIES.keys() if not k.isascii()
        )))
        return f"未対応の都市: {city_name}\n対応都市: {available}"

    lat, lon = CITIES[key]

    url = f"{API_URL}?lat={lat}&lon={lon}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://weathernews.jp/",
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return f"天気データ取得エラー: {e}"

    now = datetime.now(JST)
    lines = []

    # --- ヘッダー ---
    display_name = city_name if not city_name.isascii() else key
    lines.append(f"{'='*50}")
    lines.append(f"  {display_name}の天気 ({now.strftime('%Y/%m/%d %H:%M')})")
    lines.append(f"{'='*50}")

    # --- 現在の天気 ---
    obs = data.get("observation", {})
    if obs:
        wx_text, wx_icon = get_wx_text(obs.get("WX", 0))
        lines.append("")
        lines.append(f"  【現在の天気】")
        lines.append(f"  天気: {wx_icon} {wx_text}")
        lines.append(f"  気温: {obs.get('AIRTMP', '?')}℃ (体感: {obs.get('FEEL', '?')}℃)")
        lines.append(f"  湿度: {obs.get('RHUM', '?')}%")
        wind_dir = get_wind_dir(obs.get("WNDDIR", 0))
        lines.append(f"  風: {wind_dir} {obs.get('WNDSPD', '?')}m/s")
        lines.append(f"  気圧: {obs.get('ARPRSS', '?')}hPa")
        if obs.get("PREC", 0) > 0:
            lines.append(f"  降水量: {obs['PREC']}mm")

    # --- 今日の予報 ---
    mrf = data.get("mrf", [])
    today_forecast = None
    if mrf:
        today_forecast = mrf[0]
        wx_text, wx_icon = get_wx_text(today_forecast.get("WX", 0))
        max_t = today_forecast.get("MAXT", "?")
        min_t = today_forecast.get("MINT", "?")
        pop = today_forecast.get("POP", "?")

        lines.append("")
        lines.append(f"  【今日の予報】")
        lines.append(f"  天気: {wx_icon} {wx_text}")
        lines.append(f"  最高気温: {max_t}℃ / 最低気温: {min_t}℃")
        lines.append(f"  降水確率: {pop}%")

        sunrise = today_forecast.get("sunrise", "?")
        sunset = today_forecast.get("sunset", "?")
        lines.append(f"  日の出: {sunrise} / 日の入り: {sunset}")

    # --- 時間別予報 (今後12時間) ---
    srf = data.get("srf", [])
    if srf:
        lines.append("")
        lines.append(f"  【時間別予報】")
        lines.append(f"  {'時刻':>6}  {'天気':>8}  {'気温':>5}  {'降水':>5}  {'湿度':>4}")
        lines.append(f"  {'─'*40}")
        count = 0
        for h in srf:
            ts = h.get("tm", 0)
            dt = datetime.fromtimestamp(ts, tz=JST)
            if dt < now - timedelta(hours=1):
                continue
            if count >= 12:
                break
            wx_text, wx_icon = get_wx_text(h.get("WX", 0))
            temp = h.get("AIRTMP", "?")
            prec = h.get("PREC", 0)
            rhum = h.get("RHUM", "?")
            prec_str = f"{prec}mm" if prec > 0 else "---"
            lines.append(f"  {dt.strftime('%H:%M'):>6}  {wx_icon}{wx_text:>6}  {temp:>4}℃  {prec_str:>5}  {rhum:>3}%")
            count += 1

    # --- 週間予報 ---
    if len(mrf) > 1:
        lines.append("")
        lines.append(f"  【週間予報】")
        weekdays = ["月", "火", "水", "木", "金", "土", "日"]
        lines.append(f"  {'日付':>10}  {'天気':>8}  {'最高':>4}  {'最低':>4}  {'降水':>4}")
        lines.append(f"  {'─'*42}")
        for day in mrf[1:8]:
            ts = day.get("tm", 0)
            dt = datetime.fromtimestamp(ts, tz=JST)
            wd = weekdays[dt.weekday()]
            wx_text, wx_icon = get_wx_text(day.get("WX", 0))
            max_t = day.get("MAXT", "?")
            min_t = day.get("MINT", "?")
            pop = day.get("POP", "?")
            lines.append(f"  {dt.strftime('%m/%d')}({wd})  {wx_icon}{wx_text:>6}  {max_t:>3}℃  {min_t:>3}℃  {pop:>3}%")

    # --- 服装アドバイス ---
    if today_forecast:
        max_t = today_forecast.get("MAXT", 15)
        min_t = today_forecast.get("MINT", 5)
        wx_code = today_forecast.get("WX", 200)
        wind = obs.get("WNDSPD", 2) if obs else 2

        if isinstance(max_t, (int, float)) and isinstance(min_t, (int, float)):
            advice_list = get_clothing_advice(max_t, min_t, wx_code, wind)
            lines.append("")
            lines.append(f"  【おすすめ服装】")
            for a in advice_list:
                lines.append(f"  - {a}")

    lines.append("")
    lines.append(f"  出典: ウェザーニュース (weathernews.jp)")
    lines.append(f"{'='*50}")

    return "\n".join(lines)


def main():
    city = "東京"
    if len(sys.argv) > 1:
        city = sys.argv[1]

    result = fetch_weather(city)
    print(result)


if __name__ == "__main__":
    main()
