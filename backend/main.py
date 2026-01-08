from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os

# stations.py から必要なデータをインポート
from stations import ALL_LINES, get_stations_by_line, get_station_by_id

app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)


@app.route("/")
def serve():
    return send_from_directory(app.static_folder, "index.html")


# 路線一覧を返すAPI
@app.route("/api/lines")
def lines():
    return jsonify(ALL_LINES)


# 指定された路線の駅一覧を返すAPI
@app.route("/api/stations")
def stations():
    line_id = request.args.get("line_id")
    return jsonify(get_stations_by_line(line_id))


# 駅の詳細情報を返すAPI
@app.route("/api/station/<station_id>")
def station_detail(station_id):
    return jsonify(get_station_by_id(station_id))


if __name__ == "__main__":
    # Renderのポート環境変数に対応
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
