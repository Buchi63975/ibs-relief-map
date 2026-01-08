import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

// Leaflet用のインポートを追加
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Leafletのアイコンがデフォルトで表示されない問題を解決するための設定
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// 地図の中心を更新するためのコンポーネント
function ChangeView({ center }) {
  const map = useMap();
  map.setView(center);
  return null;
}

function App() {
  const [lines, setLines] = useState([]);
  const [line, setLine] = useState("");
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState("");
  const [station, setStation] = useState(null);

  // 【修正】APIの接続先を「自分自身」にする設定
  const API_BASE_URL =
    process.env.NODE_ENV === "development" ? "http://localhost:5000" : ""; // 本番環境では空にすることで同じサーバーを見に行くようになります

  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/api/lines`)
      .then((res) => setLines(res.data))
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (line) {
      axios.get(`${API_BASE_URL}/api/stations?line_id=${line}`).then((res) => {
        setStations(res.data);
        setStationId("");
        setStation(null);
      });
    }
  }, [line]);

  useEffect(() => {
    if (stationId) {
      axios
        .get(`${API_BASE_URL}/api/station/${stationId}`)
        .then((res) => setStation(res.data));
    }
  }, [stationId]);

  return (
    <div className="app-container">
      <h1 className="title">🏢 施設案内</h1>

      <div className="line-selector">
        {lines.map((l) => (
          <button
            key={l.id}
            onClick={() => setLine(l.id)}
            style={{
              borderColor: l.color,
              backgroundColor: line === l.id ? l.color : "#ffffff",
              color: line === l.id ? "#ffffff" : "#333333",
            }}
            className={line === l.id ? "active" : ""}
          >
            {l.name}
          </button>
        ))}
      </div>

      {stations.length > 0 && (
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="station-select"
        >
          <option value="">駅を選択してください</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {station && (
        <div className="station-card">
          <h2 style={{ color: station.line_color }}>{station.name}</h2>

          {/* --- 無料の地図 (Leaflet) --- */}
          <div className="map-wrapper">
            <MapContainer
              center={[station.lat, station.lng]}
              zoom={16}
              style={{ height: "300px", width: "100%", borderRadius: "15px" }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <Marker position={[station.lat, station.lng]}>
                <Popup>{station.name}</Popup>
              </Marker>
              <ChangeView center={[station.lat, station.lng]} />
            </MapContainer>
          </div>
          {/* ------------------------- */}

          <button
            className="route-button"
            onClick={() =>
              window.open(
                `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`
              )
            }
          >
            Googleマップでルート案内
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [lines, setLines] = useState([]);
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [aiMessage, setAiMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/lines")
      .then((res) => res.json())
      .then(setLines);
  }, []);

  // --- メインロジック: 現在地からトイレを探してカウントダウン ---
  const findNearestAndStartGuidance = () => {
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;

      // 1. 全駅データ（stations.pyにあるもの）を取得（今回は簡略化のためAPIで全取得を想定）
      // 一番近い駅を探す（三平方の定理による簡易計算）
      // ※stationsデータがフロントにあればここでループ計算

      // 今回はデモとして「一番近い駅を見つけた」と仮定して、その距離を計算
      // 本来は全駅ループして最小距離のものを特定します
      const dist = 400; // 仮の距離（メートル）
      const nearestStationName = "新宿駅";

      // 2. GPT APIに予測と励ましを依頼
      const res = await fetch("/api/gpt-prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distance: dist,
          station_name: nearestStationName,
        }),
      });
      const data = await res.json();

      // 3. 状態を更新してカウントダウン開始
      setAiMessage(data.message);
      setTimeLeft(data.minutes * 60);
      setIsLoading(false);
    });
  };

  // カウントダウンタイマー
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="App">
      <header className="App-header">
        <h1>IBS Relief Map AI</h1>

        <button
          className="emergency-btn"
          onClick={findNearestAndStartGuidance}
          disabled={isLoading}
        >
          {isLoading ? "AIが計算中..." : "今すぐ一番近いトイレを探す 📍"}
        </button>

        {timeLeft !== null && (
          <div className="countdown-card">
            <div className="ai-bubble">{aiMessage}</div>
            <div className="timer-display">{formatTime(timeLeft)}</div>
            <p>トイレ到着までの目安</p>
          </div>
        )}

        {/* 既存の路線選択など */}
      </header>
    </div>
  );
}

export default App;
