import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import google.generativeai as genai

# 既存の駅データ管理用ファイルをインポート
import stations

app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)

# --- Gemini APIの設定 ---
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
# 安定版のモデル名を指定
model = genai.GenerativeModel("models/gemini-flash-latest")


@app.route("/")
def serve():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/lines")
def lines():
    """路線一覧を返します"""
    return jsonify(stations.ALL_LINES)


@app.route("/api/stations")
def get_stations():
    """駅リストを取得します。line_id があればフィルタリングします"""
    raw_line_id = request.args.get("line_id")

    # 1. line_id が指定されている場合（ボタン押下時）
    if raw_line_id:
        # --- 徹底的な正規化処理 ---
        # 前後の空白除去、引用符の除去、小文字化を行い、判定ミスを防ぎます
        line_id = raw_line_id.strip().replace('"', "").replace("'", "").lower()

        data = stations.get_stations_by_line(line_id)

        # サーバーログに出力（Renderのログで確認可能）
        print(f"--- [API DEBUG] ---")
        print(f"Raw Line ID from Frontend: '{raw_line_id}'")
        print(f"Cleaned Line ID: '{line_id}'")
        print(f"Found Stations Count: {len(data)}")
        print(f"-------------------")

        return jsonify(data)

    # 2. line_id が指定されていない場合（アプリ起動時の全駅データ取得）
    print(f"DEBUG: Returning all {len(stations.STATIONS)} stations.")
    return jsonify(stations.STATIONS)


@app.route("/api/gpt-prediction", methods=["POST"])
def gpt_prediction():
    """Gemini APIを使用してトイレ情報と励ましメッセージを生成します"""
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
    # Renderなどのホスティング環境では PORT 環境変数を使用
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
