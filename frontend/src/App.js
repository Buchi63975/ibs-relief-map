// frontend/src/App.js
import React, { useState, useEffect, useCallback } from "react"; // 1. useCallbackを追加
import "./App.css";

function App() {
  const [stations, setStations] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [time, setTime] = useState(0);

  useEffect(() => {
    fetch("http://localhost:5000/api/stations")
      .then((res) => res.json())
      .then((data) => {
        setStations(data);
        setTime(data[0].next_time);
      });
  }, []);

  // 2. 次の駅に切り替える関数を useCallback で包む
  const moveToNextStation = useCallback(() => {
    if (stations.length === 0) return;
    const nextIndex = (currentIndex + 1) % stations.length;
    setCurrentIndex(nextIndex);
    setTime(stations[nextIndex].next_time);
  }, [stations, currentIndex]); // stations か currentIndex が変わった時だけ作り直す

  useEffect(() => {
    const timerId = setInterval(() => {
      setTime((prevTime) => {
        if (prevTime <= 1) {
          moveToNextStation();
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [moveToNextStation]); // 3. 依存関係に moveToNextStation を入れる

  if (stations.length === 0)
    return <div className="app-container">読み込み中...</div>;

  const currentStation = stations[currentIndex];

  return (
    <div className="app-container">
      <div className="countdown-card">
        <div className="station-name">次は {currentStation.name}</div>
        <div className="timer">
          {Math.floor(time / 60)}:{(time % 60).toString().padStart(2, "0")}
        </div>
        <div className="toilet-info">
          🚻 改札内トイレ: {currentStation.has_toilet_inside ? "あり" : "なし"}{" "}
          ({currentStation.stalls}個室)
        </div>
        <p style={{ marginTop: "20px", color: "#666", fontSize: "0.8rem" }}>
          ※テスト走行中（0秒になると自動で次の駅へ）
        </p>
      </div>
    </div>
  );
}

export default App;
