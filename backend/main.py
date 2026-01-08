import os
import google.generativeai as genai
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from stations import ALL_LINES, get_stations_by_line, get_station_by_id

app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)

# Geminiの設定
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-1.5-flash")


@app.route("/")
def serve():
    return send_from_directory(app.static_folder, "index.html")


@app.route(
    "/api/gpt-prediction", methods=["POST"]
)  # ルート名はReact側と合わせるためそのまま
def gpt_prediction():
    data = request.json
    dist_m = data.get("distance", 500)
    station_name = data.get("station_name", "駅")

    prompt = f"""
    あなたはIBS（過敏性腸症候群）ユーザーを支えるAIガイドです。
    ユーザーが現在地から{station_name}のトイレに向かっています。
    距離は約{dist_m}メートルです。
    
    1. 徒歩での到着時間を予測してください。
    2. ユーザーを落ち着かせる励ましの言葉（20文字以内）をください。
    
    回答は必ず以下のJSON形式のみで返してください。
    {{"minutes": 予測分(数値), "message": "励ましの言葉"}}
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
        fallback_min = max(1, round(dist_m / 80))
        return jsonify(
            {
                "minutes": fallback_min,
                "message": "大丈夫、ゆっくり進みましょう。深呼吸して。",
            }
        )


# ...（他のルート：api/linesなどはそのまま残す）...

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
