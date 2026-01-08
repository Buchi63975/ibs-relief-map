from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import openai
from stations import ALL_LINES, STATIONS, get_stations_by_line, get_station_by_id

app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)

# OpenAI APIキーの設定（RenderのEnvironment Variablesに OPENAI_API_KEY を設定してください）
client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


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


# --- GPTによる到着予測 & 励ましAPI ---
@app.route("/api/gpt-prediction", methods=["POST"])
def gpt_prediction():
    data = request.json
    dist_m = data.get("distance")  # 距離（メートル）
    station_name = data.get("station_name")

    # GPTに「状況」を伝えて、時間を予測させ、励まさせる
    prompt = f"""
    あなたはIBS（過敏性腸症候群）ユーザーを支えるAIガイドです。
    ユーザーが現在地から{station_name}のトイレに向かっています。
    距離は約{dist_m}メートルです。
    
    1. 徒歩での到着時間を予測してください。
    2. ユーザーを落ち着かせる励ましの言葉（20文字以内）をください。
    
    回答は必ず以下のJSON形式のみで返してください。
    {{"minutes": 予測分(数値), "message": "励ましの言葉"}}
    """

    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a helpful assistant for IBS users."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )
    import json

    return response.choices[0].message.content


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
