import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  // --- 1. 状態（データ）の準備 ---
  const [station, setStation] = useState(null);
  const [line, setLine] = useState("yamanote");
  const [error, setError] = useState(null);

  const lines = [
    { id: "yamanote", name: "山手線" },
    { id: "chuo", name: "中央線快速" },
    { id: "saikyo", name: "埼京線" },
    { id: "shonan", name: "湘南新宿" },
  ];

  // --- 2. GPSを取得してサーバーに送る関数 ---
  const updateLocation = () => {
    if (!navigator.geolocation) {
      setError("お使いのブラウザはGPSに対応していません");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        // Flaskサーバーに位置情報と現在選択中の路線を送る
        fetch("/api/nearest-station", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: latitude, lng: longitude, line: line }),
        })
          .then((res) => res.json())
          .then((data) => setStation(data))
          .catch((err) => setError("サーバーとの通信に失敗しました"));
      },
      () => setError("位置情報の取得を許可してください")
    );
  };

  // 路線が変わるたびに再計算する
  useEffect(() => {
    updateLocation();
  }, [line]);

  // --- 3. 画面の見た目 (JSX) ---
  return (
    <div className="app-container">
      {/* タイトルを変更 */}
      <h1> 施設案内</h1>

      <div className="line-selector">
        {lines.map((l) => (
          <button
            key={l.id}
            onClick={() => setLine(l.id)}
            // style を追加して、動的に色を変える
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

      {error && <p className="error">{error}</p>}

      {station ? (
        <div className="station-card">
          <h2>次は: {station.name}駅</h2>
          <div className="stalls-info">
            <span className="number">{station.stalls}</span> 個室あり
          </div>
          <p className="line-tag" style={{ color: station.line_color }}>
            {station.line_name}
          </p>
          <button className="update-btn" onClick={updateLocation}>
            情報を更新
          </button>
        </div>
      ) : (
        <p>位置情報を取得中...</p>
      )}
    </div>
  );
}

export default App;
