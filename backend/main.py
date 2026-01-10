import os
import random
import google.generativeai as genai
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# 既存の駅データ管理用ファイルをインポート
from stations import ALL_LINES, get_stations_by_line, get_station_by_id

app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)

# --- Gemini APIの設定 ---
# Renderの環境変数にGEMINI_API_KEYを設定してください
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
# 利用可能なモデルをログに表示するデバッグコード
try:
    print("--- Available Models ---")
    for m in genai.list_models():
        if "generateContent" in m.supported_generation_methods:
            print(f"Model Name: {m.name}")
except Exception as e:
    print(f"Could not list models: {e}")
model = genai.GenerativeModel("gemini-pro")


@app.route("/")
def serve():
    """Reactのフロントエンドを提供します"""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/lines")
def lines():
    """路線一覧を取得します"""
    return jsonify(ALL_LINES)


@app.route("/api/stations")
def stations():
    """指定された路線の駅リストを取得します"""
    line_id = request.args.get("line_id")
    return jsonify(get_stations_by_line(line_id))


# --- AIルート＆トイレ位置予測API ---
@app.route("/api/gpt-prediction", methods=["POST"])
def gpt_prediction():
    """
    現在地、目的地から「所要時間」「移動手順」「構内トイレ位置」をAIに予測させます
    """
    data = request.json
    lat = data.get("lat")
    lng = data.get("lng")
    station_name = data.get("station_name", "目的地")
    is_manual = data.get("is_manual", False)

    # プロンプトの構築：トイレの場所を「具体的」に答えるよう強く指示
    prompt = f"""
    あなたはIBS（過敏性腸症候群）で苦しむユーザーを救う、最高峰の駅構内コンシェルジュです。
    現在地（緯度:{lat}, 経度:{lng}）から【{station_name}】への移動と、駅構内のトイレ情報を教えてください。

    【要求事項】
    1. 公共交通機関と徒歩を組み合わせた到着予測時間（分）
    2. 到着までの具体的な移動ステップ（3〜4つ）
    3. 駅構内のトイレの具体的な場所（例：北口改札内、〇〇線ホーム中央の階段下など）
       ※AIの知識から可能な限り具体的に予測してください。
    4. 魂の励ましメッセージ（15文字以内）

    【指示】
    - {f"ユーザーはこの駅を自ら選択しました。最適な乗換ルートを提案してください。" if is_manual else "緊急事態です！現在地から一番近いこの駅まで最短で駆け込むルートを教えてください。"}
    - 励ましは「お尻を締めろ！」「括約筋を信じて！」「最悪漏らしても大丈夫だ」という切実なトーンで。

    【回答形式】必ず以下のJSON形式のみで返してください。余計な解説は不要です。
    {{
      "minutes": 予測合計分(数値), 
      "steps": ["ステップ1", "ステップ2", "ステップ3"],
      "toilet_info": "駅構内トイレの具体的な場所の解説（例：中央改札を入ってすぐ右手の多機能トイレが空いています）",
      "message": "励ましの言葉"
    }}
    """

    try:
        # Geminiで回答生成
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json"
            ),
        )

        # AIの回答をそのまま返却
        return response.text

    except Exception as e:
        print(f"Gemini API Error: {e}")
        # APIエラー時のバックアップデータ
        return jsonify(
            {
                "minutes": 12,
                "steps": [
                    f"{station_name}へ向かって移動開始",
                    "公共交通機関を最短で利用",
                    "駅到着後、即座に改札内トイレへ",
                ],
                "toilet_info": "駅構内図を確認し、一番近い改札内のトイレを目指してください！",
                "message": "諦めるな！お尻を締めろ！",
            }
        )


if __name__ == "__main__":
    # ポート番号はRenderの仕様に合わせて自動取得
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
