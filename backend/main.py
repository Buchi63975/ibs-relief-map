import os
import google.generativeai as genai
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# stations.pyからデータをインポート
from stations import ALL_LINES, get_stations_by_line, get_station_by_id

app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)

# --- Geminiの設定 ---
# RenderのEnvironment Variablesに GEMINI_API_KEY を登録してください
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-1.5-flash")


@app.route("/")
def serve():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/lines")
def lines():
    return jsonify(ALL_LINES)


@app.route("/api/stations")
def stations():
    line_id = request.args.get("line_id")
    return jsonify(get_stations_by_line(line_id))


# --- AIによる到着予測 & 励ましAPI ---
@app.route("/api/gpt-prediction", methods=["POST"])
def gpt_prediction():
    data = request.json
    dist_m = data.get("distance", 500)
    station_name = data.get("station_name", "最寄り駅")

    # Geminiへの指示（プロンプト）
    prompt = f"""
    あなたはIBS（過敏性腸症候群）ユーザーを支えるAIです。
    ユーザーが現在地から{station_name}のトイレに向かっています。距離は約{dist_m}mです。
    
    1. 徒歩（分速80m程度）での到着時間を予測してください。
    2. ユーザーの不安を和らげる短い励まし（15文字以内）をください。
    
    回答は必ず以下のJSON形式のみで返してください。
    {{"minutes": 予測分(数値), "message": "励ましの言葉"}}
    """

    try:
        # Geminiで生成
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json"
            ),
        )
        # Geminiの返答をそのまま返す
        return response.text
    except Exception as e:
        print(f"Gemini Error: {e}")
        # エラー時のバックアップ（計算で算出）
        fallback_min = max(1, round(dist_m / 80))
        return jsonify(
            {"minutes": fallback_min, "message": "大丈夫、一歩ずつ進みましょう。"}
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
