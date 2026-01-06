// frontend/src/App.js
import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [currentStation, setCurrentStation] = useState(null);
  const [time, setTime] = useState(0);

  useEffect(() => {
    // ブラウザのGPSを監視
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        // バックエンドに現在地を送信して一番近い駅をもらう
        fetch("http://localhost:5000/api/nearest-station", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: latitude, lng: longitude }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (currentStation?.name !== data.name) {
              setCurrentStation(data);
              setTime(data.next_time);
            }
          });
      },
      (error) => console.error(error),
      { enableHighAccuracy: true } // 高精度GPSを使用
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentStation]);

  // カウントダウンタイマー
  useEffect(() => {
    const timerId = setInterval(() => {
      setTime((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  if (!currentStation)
    return <div className="app-container">GPSを取得中...</div>;

  return (
    <div className="app-container">
      <div className="countdown-card">
        <div className="station-name">現在、{currentStation.name} 駅付近</div>
        <div className="timer">
          {Math.floor(time / 60)}:{(time % 60).toString().padStart(2, "0")}
        </div>
        <div className="toilet-info">
          🚻 トイレ個室: {currentStation.stalls}
        </div>
        <p style={{ fontSize: "0.8rem", color: "#666", marginTop: "20px" }}>
          移動に合わせて駅名が自動更新されます
        </p>
      </div>
    </div>
  );
}

export default App;
