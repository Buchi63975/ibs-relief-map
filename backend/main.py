# backend/main.py
import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from stations import YAMANOTE_STATIONS
import math

# Reactのビルドフォルダを指定
app = Flask(__name__, static_folder="../frontend/build", static_url_path="/")
CORS(app)


# --- 既存のロジック ---
def calculate_distance(lat1, lng1, lat2, lng2):
    return math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2)


@app.route("/api/nearest-station", methods=["POST"])
def get_nearest_station():
    data = request.json
    user_lat, user_lng = data.get("lat"), data.get("lng")
    nearest_station = min(
        YAMANOTE_STATIONS,
        key=lambda s: calculate_distance(user_lat, user_lng, s["lat"], s["lng"]),
    )
    return jsonify(nearest_station)


# --- ここが重要：スマホで画面を表示するための設定 ---
@app.route("/")
def serve():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
