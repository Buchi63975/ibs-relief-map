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
        print("📡 /api/stations called (no line_id) -> returning all stations")
        return jsonify(stations.STATIONS)

    line_id = raw_line_id.strip().replace('"', "").replace("'", "").lower()
    print(f"📡 /api/stations called with line_id='{line_id}'")

    if line_id in LINE_MAP and ODPT_API_KEY:
        try:
            url = "https://api.odpt.org/api/v4/odpt:Station"
            params = {"odpt:line": LINE_MAP[line_id], "acl:consumerKey": ODPT_API_KEY}
            print(f"➡️ 外部APIへ問い合わせ: url={url} params={params}")
            response = requests.get(url, params=params, timeout=5)
            response.raise_for_status()
            api_data = response.json()
            print(
                f"⬅️ 外部APIステータス={response.status_code} items={len(api_data) if isinstance(api_data, list) else 'N/A'}"
            )

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

        except Exception as e:
            print(f"⚠️ API Error for {line_id}: {e}")

    # 外部APIが使えない／データがない場合はローカルデータを返す
    local = stations.get_stations_by_line(line_id)
    print(f"🔁 ローカルデータを返却 count={len(local)}")
    return jsonify(local)


@app.route("/api/gpt-prediction", methods=["POST"])
def gpt_prediction():
    data = request.json
    lat = data.get("lat")
    lng = data.get("lng")
    station_name = data.get("station_name", "目的地")

    prompt = f"""
    あなたはIBS（過敏性腸症候群）で苦しむユーザーを救う、最高峰の駅構内コンシェルジュです。
    現在地（緯度:{lat}, 経度:{lng}）から【{station_name}】への移動と、駅構内のトイレ情報を教えてください。

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
