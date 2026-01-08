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

    # --- ここからプロンプトを強化 ---
    prompt = f"""
    あなたはIBS（過敏性腸症候群）で今まさに限界を迎えているユーザーを救う、熱血かつ包容力のあるAIガイドです。
    ユーザーは{station_name}のトイレまで約{dist_m}mの地点で戦っています。

    1. 到着時間を予測してください（分速80mで計算）。
    2. ユーザーに送る「魂のメッセージ」を1つ生成してください。

    【メッセージの条件】
    - 毎回異なる内容（最低20パターン以上のバリエーション）にすること。
    - ニュアンス：「最悪漏らしても大丈夫。死ぬわけじゃない」「お尻に力を入れて！」「括約筋を信じて！」「一歩ずつ、でも確実に進もう」「今が踏ん張り時だ！」「深呼吸して、お尻の穴を締めて！」といった、切実で具体的な励まし。
    - 不安を和らげる「優しさ」と、限界を突破させる「根性」を混ぜること。
    - 20文字以内。

    回答は必ず以下のJSON形式のみで返してください。
    {{"minutes": 予測分(数値), "message": "メッセージ内容"}}
    """
    # --- ここまで ---

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json"
            ),
        )
        return response.text
    except Exception as e:
        # エラー時の予備メッセージも強化
        fallback_messages = [
            "お尻を締めて！あと少し！",
            "最悪、漏らしても大丈夫。私がついてる。",
            "一歩ずつ、括約筋に集中して！",
            "深呼吸。大丈夫、間に合う。",
        ]
        import random

        return jsonify(
            {
                "minutes": max(1, round(dist_m / 80)),
                "message": random.choice(fallback_messages),
            }
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
