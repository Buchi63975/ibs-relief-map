import os
import requests  # 外部API取得用に追加
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
import stations

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


@app.route("/")
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

    prompt = f"""
    あなたはIBS（過敏性腸症候群）で苦しむユーザーを救う、最高峰の駅構内コンシェルジュです。
    
    【重要】以下の座標は正確なGPS座標です。駅名ではなく、この座標値を基準に計算してください。
    
    【ユーザーの正確な現在地（GPS座標）】
    緯度: {lat}
    経度: {lng}
    
    【目的地の正確な座標（GPS座標）】
    駅名: {station_name}
    緯度: {station_lat}
    経度: {station_lng}
    
    【指示】
    1. GPS座標({lat}, {lng})からGPS座標({station_lat}, {station_lng})への直線距離を計算してください
    2. 東京の公共交通を使用した場合の実際の移動時間を推定してください（直線距離の1.5倍程度が目安）
    3. 駅名「{station_name}」は参考情報です。座標値を優先してください
    4. ユーザーが今いる座標から、目的地座標への移動経路を提案してください

    【回答形式】必ず以下のJSON形式のみで返してください。
    {{
      "minutes": 予測合計分(数値), 
      "steps": ["ステップ1", "ステップ2", "ステップ3"],
      "toilet_info": "駅構内トイレの具体的な場所",
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
                "minutes": 5,
                "steps": [f"{station_name}へ直行してください"],
                "toilet_info": "駅到着後、案内図を見て最も近いトイレへ！",
                "message": "諦めるな！お尻を締めろ！",
            }
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
