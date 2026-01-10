import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import google.generativeai as genai

# 既存の駅データ管理用ファイルをインポート
import stations  # stations.py全体をインポートしてSTATIONSリストにアクセスできるようにします

app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)

# --- Gemini APIの設定 ---
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel("models/gemini-flash-latest")  # 安定版の名前に変更


@app.route("/")
def serve():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/lines")
def lines():
    return jsonify(stations.ALL_LINES)


@app.route("/api/stations")
def get_stations():
    line_id = request.args.get("line_id")

    if line_id:
        line_id = line_id.strip()  # 前後の空白を削除
        data = stations.get_stations_by_line(line_id)
        # ログを詳細化
        print(f"--- DEBUG START ---")
        print(f"Requested Line ID: '{line_id}'")
        print(f"Result Count: {len(data)}")
        print(f"--- DEBUG END ---")
        return jsonify(data)

    return jsonify(stations.STATIONS)


@app.route("/api/gpt-prediction", methods=["POST"])
def gpt_prediction():
    data = request.json
    lat = data.get("lat")
    lng = data.get("lng")
    station_name = data.get("station_name", "目的地")
    is_manual = data.get("is_manual", False)

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
