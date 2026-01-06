# backend/main.py
from flask import Flask, jsonify
from flask_cors import CORS
from stations import YAMANOTE_STATIONS

app = Flask(__name__)
CORS(app)  # Reactからの通信を許可する設定


@app.route("/api/stations", methods=["GET"])
def get_stations():
    # 全駅の情報を返すAPI
    return jsonify(YAMANOTE_STATIONS)


@app.route("/api/status", methods=["GET"])
def get_status():
    # サーバーが動いているか確認するためのテスト用API
    return jsonify({"status": "running", "message": "IBS Relief Map API is active"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
