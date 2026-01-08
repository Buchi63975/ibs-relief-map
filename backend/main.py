import os
import random
import google.generativeai as genai
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# stations.py（駅データ）から必要な関数をインポート
from stations import ALL_LINES, get_stations_by_line, get_station_by_id

app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)

# --- Gemini APIの設定 ---
# RenderのEnvironment Variablesに「GEMINI_API_KEY」を設定してください
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-1.5-flash")


@app.route("/")
def serve():
    """Reactのビルド済みファイルを返します"""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/lines")
def lines():
    """路線一覧を返します"""
    return jsonify(ALL_LINES)


@app.route("/api/stations")
def stations():
    """特定の路線の駅一覧を返します"""
    line_id = request.args.get("line_id")
    return jsonify(get_stations_by_line(line_id))


@app.route("/api/gpt-prediction", methods=["POST"])
def gpt_prediction():
    """AIによる到着予測・乗換案内・励ましを生成します"""
    data = request.json
    dist_m = data.get("distance", 500)
    station_name = data.get("station_name", "目的地")
    is_manual = data.get("is_manual", False)  # 手動選択かどうかの判定

    # AIへの指示（プロンプト）の構築
    # 手動選択時は「乗換案内」を、緊急時は「最短ルート」を重視するように指示を変えています
    prompt = f"""
    あなたはIBS（過敏性腸症候群）で苦しむユーザーを救う、熱血で非常に頼りになるナビゲーターです。
    ユーザーが現在地から【{station_name}】を目指しています。直線距離は約{dist_m}mです。

    【今回のミッション】
    1. 徒歩（分速80m）や電車利用を考慮した到着予想時間を数字で出してください。
    2. ユーザーに「具体的なルート・乗換のアドバイス」と「魂の励まし」を伝えてください。

    【指示詳細】
    - {f"ユーザーはこの駅を自ら選択しました。現在地からの乗換方法や最短の歩き方を具体的にアドバイスしてください。" if is_manual else "緊急事態です！一番近いこの駅まで、脇目も振らず最短で駆け込むルートを即答してください。"}
    - 励ましには「お尻を締めて！」「括約筋を信じて！」「最悪漏らしても大丈夫、死ぬわけじゃない」「今が踏ん張り時だ！」といった、綺麗事ではない切実な言葉を含めてください。
    - メッセージは30文字以内で、パニック時でも読みやすく短文で。

    【回答形式】
    必ず以下のJSON形式のみで返してください。
    {{"minutes": 予測分(数値), "message": "アドバイスと励ましの言葉"}}
    """

    try:
        # Geminiで回答を生成
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json"
            ),
        )
        # GeminiのJSON出力をそのまま返却
        return response.text

    except Exception as e:
        print(f"Gemini Error: {e}")

        # --- APIエラー時のバックアップ用メッセージ ---
        fallback_messages = [
            f"{station_name}まであと少し！お尻を締めて耐えるんだ！",
            "大丈夫、漏らしても私がついてる。一歩ずつ進もう。",
            "深呼吸して、括約筋に全神経を集中させて！",
            "今が人生の正念場だ！お尻に力を入れて突き進め！",
            "駅のトイレはすぐそこだ。自分を信じて！",
        ]

        fallback_min = max(1, round(dist_m / 80))
        return jsonify(
            {"minutes": fallback_min, "message": random.choice(fallback_messages)}
        )


if __name__ == "__main__":
    # Render等の環境に合わせてポートを自動設定
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
