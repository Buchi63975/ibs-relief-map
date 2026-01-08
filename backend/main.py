# backend/main.py (修正版)
import os
import math
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from stations import ALL_LINES

# --- フォルダの場所を特定 ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "build"))

# static_folder を BUILD_DIR に、static_url_path を空文字列に設定するのがコツです
app = Flask(__name__, static_folder=BUILD_DIR, static_url_path="/")
CORS(app)


@app.route("/api/nearest-station", methods=["POST"])
def get_nearest_station():
    data = request.json
    user_lat, user_lng = data.get("lat"), data.get("lng")
    line_key = data.get("line", "yamanote")
    line_data = ALL_LINES.get(line_key, ALL_LINES["yamanote"])

    nearest = min(
        line_data["stations"],
        key=lambda s: math.sqrt(
            (user_lat - s["lat"]) ** 2 + (user_lng - s["lng"]) ** 2
        ),
    )
    return jsonify(
        {**nearest, "line_name": line_data["name"], "line_color": line_data["color"]}
    )


# どんなリクエストが来ても、まずは build フォルダ内を探し、なければ index.html を返す
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    # Renderなどのサーバーでは環境変数 PORT が指定されるため、それに合わせます
    port = int(os.environ.get("PORT", 5000))
    # host='0.0.0.0' にすることで外部からの接続を許可します
    app.run(host="0.0.0.0", port=port)
