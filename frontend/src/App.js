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

  const API_BASE_URL = "https://ibs-relief-map.onrender.com";

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

export default App;
