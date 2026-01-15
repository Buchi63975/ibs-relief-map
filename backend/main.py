import os
import requests  # 外部API取得用に追加
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
import stations
import math
from datetime import datetime

app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)

# --- 設定 ---
ODPT_API_KEY = os.environ.get("ODPT_API_KEY")
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel("models/gemini-flash-latest")

# フロントエンドのIDとODPTの正式な路線識別子(URN)の紐付け
LINE_MAP = {
    "yamanote": "odpt.Line:JR-East.Yamanote",
    "chuo": "odpt.Line:JR-East.ChuoRapid",
    "saikyo": "odpt.Line:JR-East.Saikyo",
    "shonan": "odpt.Line:JR-East.ShonanShinjuku",
    "denentoshi": "odpt.Line:Tokyu.DenEnToshi",
    "hanzomon": "odpt.Line:TokyoMetro.Hanzomon",
}


# GPS座標間の距離を計算（ハバーサイン公式）
def calculate_distance_km(lat1, lon1, lat2, lon2):
    """緯度経度からキロメートル単位の距離を計算"""
    R = 6371  # 地球半径（km）
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))
    return R * c


def estimate_travel_minutes(distance_km):
    """距離からおおよその所要時間（分）を推定"""
    # 東京の平均的な公共交通速度は時速20km程度と仮定
    minutes = int((distance_km / 20) * 60 + 5)
    return max(1, minutes)


def find_nearest_station(user_lat, user_lng, exclude_station_name=None):
    """ユーザーの現在地から最寄り駅を探索"""
    min_distance = float("inf")
    nearest_station = None

    for station in stations.STATIONS:
        if exclude_station_name and station["name"] == exclude_station_name:
            continue

        distance = calculate_distance_km(
            float(user_lat), float(user_lng), station["lat"], station["lng"]
        )

        if distance < min_distance:
            min_distance = distance
            nearest_station = station

    return nearest_station


# 時間帯ごとの混雑度パターン（0-10段階、10が最も混雑）
CONGESTION_PATTERN = {
    (7, 9): 8,  # 朝ラッシュ: 非常に混雑
    (9, 11): 6,  # 朝から昼: やや混雑
    (11, 14): 3,  # 昼間: 空いている
    (14, 16): 4,  # 午後: 少し混雑
    (16, 19): 7,  # 夕方ラッシュ: 混雑
    (19, 21): 5,  # 夜間: やや混雑
}


def get_congestion_level():
    """現在の時間帯から混雑度を取得"""
    now = datetime.now()
    hour = now.hour

    for (start, end), level in CONGESTION_PATTERN.items():
        if start <= hour < end:
            return level, hour

    # 上記以外の時間（21-7時）は空いている
    return 2, hour


def get_congestion_info():
    """現在時刻の混雑度と説明文を計算"""
    level, hour = get_congestion_level()

    # 混雑度に基づく説明文
    if level >= 8:
        description = "非常に混雑している時間帯です"
        emoji = "🔴"
    elif level >= 6:
        description = "混雑している時間帯です"
        emoji = "🟠"
    elif level >= 4:
        description = "やや混雑している時間帯です"
        emoji = "🟡"
    else:
        description = "比較的空いている時間帯です"
        emoji = "🟢"

    return {"level": level, "description": description, "emoji": emoji, "hour": hour}


def serve():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/lines")
def lines():
    return jsonify(stations.ALL_LINES)


@app.route("/api/stations")
def get_stations():
    raw_line_id = request.args.get("line_id")
    if not raw_line_id:
        return jsonify(stations.STATIONS)

    line_id = raw_line_id.strip().replace('"', "").replace("'", "").lower()

    if line_id in LINE_MAP and ODPT_API_KEY:
        url = "https://api.odpt.org/api/v4/odpt:Station"
        params = {"odpt:line": LINE_MAP[line_id], "acl:consumerKey": ODPT_API_KEY}

        # タイムアウトと簡易リトライ設定
        timeout_seconds = 10
        max_attempts = 2
        for attempt in range(1, max_attempts + 1):
            try:
                response = requests.get(url, params=params, timeout=timeout_seconds)
                response.raise_for_status()
                api_data = response.json()

                if api_data:
                    formatted_stations = []
                    for s in api_data:
                        formatted_stations.append(
                            {
                                "id": s.get("owl:sameAs"),
                                "name": s.get("dc:title", "不明な駅"),
                                "line_id": line_id,
                                "lat": s.get("geo:lat"),
                                "lng": s.get("geo:long"),
                            }
                        )
                    formatted_stations.sort(key=lambda x: x["name"])
                    return jsonify(formatted_stations)

                # 空レスポンスならリトライの対象にする
                if attempt < max_attempts:
                    continue
                break

            except requests.RequestException as e:
                print(f"⚠️ ODPT request attempt {attempt} for {line_id} failed: {e}")
                if attempt < max_attempts:
                    continue
                # 最終的に失敗したらローカルデータへフォールバック
                break

    return jsonify(stations.get_stations_by_line(line_id))


@app.route("/api/gpt-prediction", methods=["POST"])
def gpt_prediction():
    data = request.json
    lat = data.get("lat")
    lng = data.get("lng")
    station_name = data.get("station_name", "目的地")
    station_lat = data.get("station_lat")
    station_lng = data.get("station_lng")

    # デバッグログ：受け取ったペイロードを出力
    print(
        f"[GPT Prediction] User Location: ({lat}, {lng}), Destination: {station_name} ({station_lat}, {station_lng})"
    )

    # 距離と所要時間を計算
    distance_km = calculate_distance_km(
        float(lat), float(lng), float(station_lat), float(station_lng)
    )
    estimated_minutes = estimate_travel_minutes(distance_km)

    # 現在地から最寄り駅を検索
    nearest_station = find_nearest_station(lat, lng, exclude_station_name=station_name)
    nearest_station_name = nearest_station["name"] if nearest_station else "最寄り駅"

    # 混雑度情報を取得
    congestion_info = get_congestion_info()

    print(f"[Distance] {distance_km:.2f}km, Estimated: {estimated_minutes}min")
    print(f"[Nearest Station] {nearest_station_name}")
    print(
        f"[Congestion] Level {congestion_info['level']}: {congestion_info['description']}"
    )

    prompt = f"""あなたはIBS（過敏性腸症候群）で苦しむユーザーを救う、最高峰の駅構内コンシェルジュです。

【重要な情報】
ユーザーの現在地（GPS）: 緯度{lat}, 経度{lng}
ユーザーに最も近い駅: {nearest_station_name}
目的駅「{station_name}」（GPS）: 緯度{station_lat}, 経度{station_lng}
計算済みの直線距離: {distance_km:.2f}km
推定所要時間: {estimated_minutes}分
現在の混雑度: {congestion_info["emoji"]} レベル{congestion_info["level"]}/10 - {congestion_info["description"]}

【指示】
1. ユーザーは「{nearest_station_name}」にいます
2. ユーザーは「{station_name}」へ移動する必要があります
3. 上記の推定所要時間{estimated_minutes}分を基準に回答してください
4. より短いルートを見つけた場合のみ、それより少ない時間を提示できます
5. {station_name}駅構内のトイレ位置も提示してください
6. 混雑状況が悪い場合は、ルート提示の際に「人が多いので急いで移動してください」などの注意を加えてください
7. 絶対に、「{station_name}」の別の駅からの経路を提示しないでください

【回答形式】必ずJSON形式のみで返してください
{{
  "minutes": {estimated_minutes},
  "steps": ["ステップ1", "ステップ2", "ステップ3"],
  "toilet_info": "トイレの具体的な位置",
  "congestion_emoji": "{congestion_info["emoji"]}",
  "congestion_level": {congestion_info["level"]},
  "message": "15文字以内の励まし"
}}
"""

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json"
            ),
        )
        return response.text
    except Exception as e:
        print(f"Gemini Error: {e}")
        return jsonify(
            {
                "minutes": estimated_minutes,
                "steps": [f"{station_name}へ直行してください"],
                "toilet_info": "駅到着後、案内図を見て最も近いトイレへ！",
                "message": "諦めるな！お尻を締めろ！",
            }
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
