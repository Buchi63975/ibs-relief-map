import React, { useState, useEffect } from "react";
import "./App.css";

// APIの接続先設定
const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

function App() {
  const [allStations, setAllStations] = useState([]); // 全駅データを保持
  const [timeLeft, setTimeLeft] = useState(null);
  const [aiMessage, setAiMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [arrivalStation, setArrivalStation] = useState("");

  // 1. 起動時に全路線の駅データを一括で読み込む
  useEffect(() => {
    const lines = ["yamanote", "chuo", "saikyo", "shonan"];
    lines.forEach((lineId) => {
      fetch(`${API_BASE_URL}/api/stations?line_id=${lineId}`)
        .then((res) => res.json())
        .then((data) => {
          setAllStations((prev) => [...prev, ...data]);
        });
    });
  }, []);

  // 2. カウントダウンタイマーの処理
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // 3. メイン機能：現在地から一番近い駅を探して案内開始
  const handleEmergencyClick = () => {
    if (!navigator.geolocation) {
      alert("GPSが利用できません");
      return;
    }

    setIsLoading(true);
    setAiMessage("現在地を確認中...");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        let minDistance = Infinity;
        let nearest = null;

        // 全駅の中から一番近い駅を計算
        allStations.forEach((s) => {
          const d = Math.sqrt(
            Math.pow(s.lat - latitude, 2) + Math.pow(s.lng - longitude, 2)
          );
          if (d < minDistance) {
            minDistance = d;
            nearest = s;
          }
        });

        if (nearest) {
          setArrivalStation(nearest.name);
          try {
            // GPT APIに予測と励ましを依頼
            const res = await fetch(`${API_BASE_URL}/api/gpt-prediction`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                distance: Math.round(minDistance * 111000),
                station_name: nearest.name,
              }),
            });
            const data = await res.json();
            setAiMessage(data.message);
            setTimeLeft(data.minutes * 60);
          } catch (err) {
            setAiMessage("大丈夫、ゆっくり向かいましょう。");
            setTimeLeft(300); // 失敗時は5分に設定
          }
        }
        setIsLoading(false);
      },
      () => {
        alert("位置情報の取得に失敗しました。設定を確認してください。");
        setIsLoading(false);
      }
    );
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>IBS Relief Map AI</h1>

        {/* 緊急ボタン：一番目立つ場所に配置 */}
        {!timeLeft && (
          <div className="main-controls">
            <button
              className="big-emergency-btn"
              onClick={handleEmergencyClick}
              disabled={isLoading}
            >
              {isLoading ? "AIが解析中..." : "今すぐトイレを探す 📍"}
            </button>
            <p className="hint">
              ボタンを押すと現在地から一番近い駅を自動選別します
            </p>
          </div>
        )}

        {/* カウントダウン表示エリア */}
        {timeLeft !== null && (
          <div className="countdown-card">
            <h2 className="target-station">{arrivalStation} のトイレまで</h2>
            <div className="timer-display">{formatTime(timeLeft)}</div>
            <div className="ai-bubble">
              <span className="ai-icon">🤖</span>
              {aiMessage}
            </div>
            <button className="reset-btn" onClick={() => setTimeLeft(null)}>
              完了・戻る
            </button>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
