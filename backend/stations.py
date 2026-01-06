# backend/stations.py

# JR山手線の駅データ (内回り：反時計回りを想定した例)
# next_time: 次の駅までの標準走行時間（秒）
# has_toilet_inside: 改札内にトイレがあるか
# stalls: 個室数（仮の数値）

YAMANOTE_STATIONS = [
    {
        "id": 1,
        "name": "東京",
        "lat": 35.681236,
        "lng": 139.767125,
        "next_time": 120,
        "has_toilet_inside": True,
        "stalls": 10,
    },
    {
        "id": 2,
        "name": "有楽町",
        "lat": 35.675069,
        "lng": 139.763328,
        "next_time": 150,
        "has_toilet_inside": True,
        "stalls": 4,
    },
    {
        "id": 3,
        "name": "新橋",
        "lat": 35.666427,
        "lng": 139.758350,
        "next_time": 180,
        "has_toilet_inside": True,
        "stalls": 6,
    },
    # 開発が進んだらここに全29駅分を順次追加していきます
]
