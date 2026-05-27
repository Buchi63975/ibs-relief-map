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


def _deg_to_km_coords(lat, lon, ref_lat):
    """緯度経度を簡易的に平面座標(km)に変換（小領域向け）"""
    # 1度の緯度差はおよそ110.574 km、経度は緯度によって変わる
    km_per_deg_lat = 110.574
    km_per_deg_lon = 111.320 * math.cos(math.radians(ref_lat))
    x = (lon) * km_per_deg_lon
    y = (lat) * km_per_deg_lat
    return x, y


def point_segment_distance_km(lat, lon, lat1, lon1, lat2, lon2):
    """点から線分への最短距離を km 単位で返す（小領域近似）"""
    # 基準緯度に両端の平均を使う
    ref_lat = (lat1 + lat2 + lat) / 3.0
    px, py = _deg_to_km_coords(lat, lon, ref_lat)
    x1, y1 = _deg_to_km_coords(lat1, lon1, ref_lat)
    x2, y2 = _deg_to_km_coords(lat2, lon2, ref_lat)

    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)

    # プロジェクション t
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)


def sort_stations_by_order(line_id):
    """路線の駅を id の数値部分でソートして返す"""
    filtered = [s for s in stations.STATIONS if s["line_id"] == line_id]

    def keyfn(s):
        # id の末尾の数値を取り出す（例: y01 -> 1）
        import re

        m = re.search(r"(\d+)$", s.get("id", ""))
        return int(m.group(1)) if m else 0

    return sorted(filtered, key=keyfn)


def detect_on_train(user_lat, user_lng, threshold_km=0.05):
    """ユーザーの位置が線路上（線分に近い）か検出。近い線分とその両端駅インデックスを返す"""
    best = None
    for line in stations.ALL_LINES:
        line_id = line["id"]
        ordered = sort_stations_by_order(line_id)
        for i in range(len(ordered) - 1):
            s1 = ordered[i]
            s2 = ordered[i + 1]
            d = point_segment_distance_km(
                user_lat, user_lng, s1["lat"], s1["lng"], s2["lat"], s2["lng"]
            )
            if best is None or d < best["distance"]:
                best = {
                    "distance": d,
                    "line_id": line_id,
                    "from_index": i,
                    "to_index": i + 1,
                    "from_station": s1,
                    "to_station": s2,
                }

    if best and best["distance"] <= threshold_km:
        return best
    return None


def estimate_minutes_along_line(
    user_lat, user_lng, line_id, from_index, to_index, target_station_id
):
    """現在位置が (from_index -> to_index) の区間にあるとき、target_station_id までの所要分数を推定する"""
    ordered = sort_stations_by_order(line_id)
    # find target index
    target_idx = next(
        (idx for idx, s in enumerate(ordered) if s["id"] == target_station_id), None
    )
    if target_idx is None:
        return None, ordered

    # decide direction: if target_idx >= to_index => forward direction (increasing idx)
    if target_idx >= to_index:
        indices = list(range(to_index, target_idx + 1))
        # distance from user to station at to_index (partial)
        first_segment = calculate_distance_km(
            user_lat, user_lng, ordered[to_index]["lat"], ordered[to_index]["lng"]
        )
    else:
        # going backwards
        indices = list(range(from_index, target_idx - 1, -1))
        first_segment = calculate_distance_km(
            user_lat, user_lng, ordered[from_index]["lat"], ordered[from_index]["lng"]
        )

    # sum distances along remaining station-to-station segments
    total_km = first_segment
    if len(indices) >= 2:
        for i in range(len(indices) - 1):
            a = ordered[indices[i]]
            b = ordered[indices[i + 1]]
            total_km += calculate_distance_km(a["lat"], a["lng"], b["lat"], b["lng"])

    # 平均列車速度（停車込み）を仮定（km/h）
    train_speed_kmh = 40.0
    travel_minutes = (total_km / train_speed_kmh) * 60

    # 停車時間（各途中駅で30秒=0.5分程度）
    stops = max(
        0, abs(target_idx - (to_index if target_idx >= to_index else from_index))
    )
    dwell_minutes = stops * 0.5

    estimated = int(math.ceil(travel_minutes + dwell_minutes))
    return estimated, ordered


@app.route("/api/estimate-arrival", methods=["POST"])
def estimate_arrival():
    data = request.json or {}
    lat = data.get("lat")
    lng = data.get("lng")
    target_station_id = data.get("station_id")

    if lat is None or lng is None or not target_station_id:
        return jsonify({"error": "lat, lng, station_id required"}), 400

    detected = detect_on_train(float(lat), float(lng))
    if not detected:
        return jsonify({"on_train": False})

    # まずODPTの時刻表で推定を試みる
    timetable_estimate = None
    if ODPT_API_KEY and detected["line_id"] in LINE_MAP:
        try:
            timetable_estimate = fetch_timetable_estimate(detected, target_station_id)
        except Exception as e:
            print(f"ODPT timetable fetch error: {e}")

    # ODPT推定が得られなければ距離ベースの推定にフォールバック
    if timetable_estimate is None:
        est_minutes, ordered = estimate_minutes_along_line(
            float(lat),
            float(lng),
            detected["line_id"],
            detected["from_index"],
            detected["to_index"],
            target_station_id,
        )
    else:
        est_minutes = timetable_estimate

    response = {
        "on_train": True,
        "line_id": detected["line_id"],
        "from_station": detected["from_station"],
        "to_station": detected["to_station"],
        "distance_to_track_km": detected["distance"],
        "estimated_minutes": est_minutes,
        "timetable_used": timetable_estimate is not None,
    }
    return jsonify(response)


def fetch_timetable_estimate(detected, target_station_id):
    """ODPT の時刻表から target_station_id までの次の到着時間を推定（分）

    戻り値: 推定分（int）または None
    """
    line_id = detected["line_id"]
    odpt_line = LINE_MAP.get(line_id)
    if not odpt_line:
        return None

    url = "https://api.odpt.org/api/v4/odpt:TrainTimetable"
    params = {"odpt:railway": odpt_line, "acl:consumerKey": ODPT_API_KEY}
    timeout_seconds = 10
    resp = requests.get(url, params=params, timeout=timeout_seconds)
    resp.raise_for_status()
    api_data = resp.json()

    # 今日の時刻を取得（ローカル時刻）
    now = datetime.now()

    # 我々のローカル駅データで target_station の name を取得
    target_station = next(
        (s for s in stations.STATIONS if s["id"] == target_station_id), None
    )
    if not target_station:
        return None
    target_name = target_station.get("name")

    # ODPT のレスポンスは複数形式があり得るため、柔軟に探索する
    candidate_minutes = []

    for item in api_data:
        # 各アイテム内の辞書やリストを再帰的に探索して、駅名と時刻を含む構造を探す
        def find_station_entries(obj):
            entries = []
            if isinstance(obj, dict):
                # 駅情報っぽい辞書を検査
                if ("odpt:station" in obj) or (
                    "station" in obj
                    and ("arrivalTime" in obj or "departureTime" in obj)
                ):
                    entries.append(obj)
                for v in obj.values():
                    entries.extend(find_station_entries(v))
            elif isinstance(obj, list):
                for v in obj:
                    entries.extend(find_station_entries(v))
            return entries

        entries = find_station_entries(item)
        if not entries:
            continue

        # entries は駅ごとの辞書のリスト。各辞書に時刻があれば target を探す
        for e in entries:
            # 駅名をいくつかのキーで比較
            names = []
            if "odpt:station" in e:
                names.append(e.get("odpt:station"))
            if "station" in e:
                names.append(e.get("station"))
            if "odpt:stationTitle" in e:
                names.append(e.get("odpt:stationTitle"))
            # 名称の正規化
            names = [str(n) for n in names if n]
            if not any(target_name in n or n in target_name for n in names):
                continue

            # 時刻キーを探す
            time_keys = [k for k in e.keys() if "Time" in k or "time" in k.lower()]
            for tk in time_keys:
                tval = e.get(tk)
                if not tval:
                    continue
                # tval が HH:MM:SS 形式かリストか辞書かに対応
                if isinstance(tval, str):
                    try:
                        hhmm = tval.split("+")[0]
                        dt = datetime.strptime(hhmm, "%H:%M:%S").replace(
                            year=now.year, month=now.month, day=now.day
                        )
                    except Exception:
                        continue
                    delta = (dt - now).total_seconds() / 60.0
                    if delta < -30:
                        # 深夜のスケジュールで前日の可能性 -> 翌日扱い
                        dt = dt.replace(day=now.day + 1)
                        delta = (dt - now).total_seconds() / 60.0
                    if delta >= -1:
                        candidate_minutes.append(delta)
                elif isinstance(tval, list):
                    for sub in tval:
                        if isinstance(sub, str):
                            try:
                                dt = datetime.strptime(
                                    sub.split("+")[0], "%H:%M:%S"
                                ).replace(year=now.year, month=now.month, day=now.day)
                                delta = (dt - now).total_seconds() / 60.0
                                if delta < -30:
                                    dt = dt.replace(day=now.day + 1)
                                    delta = (dt - now).total_seconds() / 60.0
                                if delta >= -1:
                                    candidate_minutes.append(delta)
                            except Exception:
                                continue

    if not candidate_minutes:
        return None

    # 最小の正数を返す（分）
    best_min = int(math.ceil(min(m for m in candidate_minutes if m is not None)))
    return best_min


def serve():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/")
def index():
    return serve()


@app.route("/<path:path>")
def serve_static(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return serve()


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
    on_train = data.get("on_train", False)
    estimated_arrival = data.get("estimated_arrival_minutes")

    # デバッグログ：受け取ったペイロードを出力
    print(
        f"[GPT Prediction] User Location: ({lat}, {lng}), Destination: {station_name} ({station_lat}, {station_lng}), on_train: {on_train}, estimated_arrival: {estimated_arrival}"
    )

    # 距離と所要時間を計算
    distance_km = calculate_distance_km(
        float(lat), float(lng), float(station_lat), float(station_lng)
    )
    estimated_minutes = estimate_travel_minutes(distance_km)

    # 現在地から最寄り駅を検索
    nearest_station = find_nearest_station(lat, lng)
    nearest_station_name = nearest_station["name"] if nearest_station else "最寄り駅"

    print(f"[Distance] {distance_km:.2f}km, Estimated: {estimated_minutes}min")
    print(f"[Nearest Station] {nearest_station_name}")

    extra_arrival = (
        f"推定到着時間: {estimated_arrival}分\n" if estimated_arrival else ""
    )
    prompt = f"""あなたはIBS（過敏性腸症候群）で苦しむユーザーを救う、最高峰の駅構内コンシェルジュです。

【重要な情報】
ユーザーの現在地（GPS）: 緯度{lat}, 経度{lng}
ユーザーに最も近い駅: {nearest_station_name}
目的駅「{station_name}」（GPS）: 緯度{station_lat}, 経度{station_lng}
計算済みの直線距離: {distance_km:.2f}km
推定所要時間: {estimated_minutes}分
{extra_arrival}
【指示】
1. 現在の所要時間は必ずユーザーの現在地から目的駅までのものとして扱ってください。
2. 最寄り駅は参考情報として扱い、時間計算の基準にはしないでください。
3. グローバルに提供されている推定到着時間がある場合は、それを優先してください。
4. 上記の推定所要時間{estimated_minutes}分を基準に回答してください。
5. より短いルートを見つけた場合のみ、それより少ない時間を提示できます。
6. {station_name}駅構内のトイレ位置も提示してください。
7. 絶対に、「{station_name}」の別の駅からの経路を提示しないでください。

【回答形式】必ずJSON形式のみで返してください
{{
  "minutes": {estimated_minutes},
  "steps": ["ステップ1", "ステップ2", "ステップ3"],
  "toilet_info": "トイレの具体的な位置",
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
