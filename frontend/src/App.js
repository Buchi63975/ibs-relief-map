import React, { useState, useEffect } from "react";
import "./App.css";

// APIの接続先（Render環境かローカルか自動判別）
const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

function App() {
  // --- 状態管理 (State) ---
  const [lines, setLines] = useState([]); // 路線一覧
  const [allStations, setAllStations] = useState([]); // 全駅データ（GPS検索用）
  const [timeLeft, setTimeLeft] = useState(null); // カウントダウン（秒）
  const [aiMessage, setAiMessage] = useState(""); // Geminiからの励まし
  const [isLoading, setIsLoading] = useState(false); // 読み込み中フラグ
  const [arrivalStation, setArrivalStation] = useState(""); // 到着予定駅

  // --- 1. 起動時にデータを読み込む ---
  useEffect(() => {
    // 路線一覧を取得
    fetch(`${API_BASE_URL}/api/lines`)
      .then((res) => res.json())
      .then(setLines);

    // 全路線の駅データを読み込んでストックしておく
    const lineIds = ["yamanote", "chuo", "saikyo", "shonan"];
    lineIds.forEach((id) => {
      fetch(`${API_BASE_URL}/api/stations?line_id=${id}`)
        .then((res) => res.json())
        .then((data) => {
          setAllStations((prev) => [...prev, ...data]);
        });
    });
  }, []);

  // --- 2. カウントダウンタイマー ---
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // --- 3. 緊急ボタンの処理 (GPS + Gemini) ---
  const handleEmergencyClick = () => {
    if (!navigator.geolocation) {
      alert("GPSが利用できません");
      return;
    }

    setIsLoading(true);
    setAiMessage("一番近いトイレを探しています...");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let minDistance = Infinity;
        let nearest = null;

        // 最寄り駅を計算
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
            // バックエンド（Gemini）へ予測と励ましを依頼
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
            setAiMessage("大丈夫、ゆっくり向かいましょう。深呼吸して。");
            setTimeLeft(300);
          }
        }
        setIsLoading(false);
      },
      () => {
        alert("位置情報の取得に失敗しました");
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
        <h1 className="title">IBS Relief Map AI</h1>

        {/* 路線選択セクション */}
        <div className="line-selector">
          <p className="section-label">路線から探す</p>
          <div className="line-buttons">
            {lines.map((line) => (
              <button
                key={line.id}
                className="line-btn"
                style={{ backgroundColor: line.color }}
                onClick={() =>
                  alert(`${line.name}の駅リストを表示（機能拡張用）`)
                }
              >
                {line.name}
              </button>
            ))}
          </div>
        </div>

        <div className="divider" />

        {/* 緊急ボタンセクション */}
        {!timeLeft && (
          <div className="emergency-section">
            <button
              className="big-emergency-btn"
              onClick={handleEmergencyClick}
              disabled={isLoading}
            >
              {isLoading ? "AI解析中..." : "🚨 現在地から自動検索"}
            </button>
            <p className="hint">一番近いトイレを特定してカウントダウンします</p>
          </div>
        )}

        {/* カウントダウン表示 */}
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
