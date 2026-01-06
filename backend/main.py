# backend/main.py
from flask import Flask, jsonify, request
from flask_cors import CORS
from stations import YAMANOTE_STATIONS
import math  # 距離計算用

app = Flask(__name__)
CORS(app)


# 2つの緯度経度から距離（メートル）を計算する関数
def calculate_distance(lat1, lng1, lat2, lng2):
    # 簡易的な距離計算（三平方の定理の応用）
    # 本来は地球の曲率を考慮するハバサイン公式を使いますが、駅間ならこれで十分です
    return math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2)


@app.route("/api/nearest-station", methods=["POST"])
def get_nearest_station():
    data = request.json
    user_lat = data.get("lat")
    user_lng = data.get("lng")

    if user_lat is None or user_lng is None:
        return jsonify({"error": "No coordinates provided"}), 400

    # 全駅の中から、一番距離が近い駅を探す
    nearest_station = min(
        YAMANOTE_STATIONS,
        key=lambda s: calculate_distance(user_lat, user_lng, s["lat"], s["lng"]),
    )

    return jsonify(nearest_station)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
