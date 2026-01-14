import React, { useState, useEffect } from "react";
import "./App.css";

const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

function App() {
  const [lines, setLines] = useState([]);
  const [selectedLineStations, setSelectedLineStations] = useState([]);
  const [navigationData, setNavigationData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // 初回ロード時に路線一覧を取得
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/lines`)
      .then((res) => res.json())
      .then((data) => setLines(data))
      .catch((err) => console.error("路線取得エラー:", err));
  }, []);

  // 路線クリック時の処理
  const handleLineClick = async (lineId) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/stations?line_id=${lineId}`);
      const data = await res.json();
      setSelectedLineStations(data);
    } catch (err) {
      alert("駅データの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // 駅選択時のナビ開始処理
  const startNavigation = async (station) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gpt-prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_name: station.name,
          lat: station.lat,
          lng: station.lng,
          line_id: station.line_id,
        }),
      });
      const data = await res.json();
      setNavigationData({ ...data, stationName: station.name });
      setSelectedLineStations([]); // リストを閉じる
    } catch (err) {
      alert("AI診断に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // 表示コンテンツの切り分け（排他制御）
  const renderContent = () => {
    if (navigationData) {
      // 1. ナビゲーション（タイマー）画面
      return (
        <div className="countdown-card">
          <h2 className="target-station">{navigationData.stationName}</h2>
          <div className="timer-display">{navigationData.minutes}分</div>
          <div className="toilet-location-box">
            <span className="location-label">🚾 トイレ位置予測</span>
            <p className="location-text">{navigationData.toilet_info}</p>
          </div>
          <div className="route-guide">
            <span className="guide-title">🏃‍♂️ 最短ルート</span>
            {navigationData.steps.map((step, i) => (
              <p key={i} className="step-text">
                {i + 1}. {step}
              </p>
            ))}
          </div>
          <p className="ai-msg">"{navigationData.message}"</p>
          <button className="reset-btn" onClick={() => setNavigationData(null)}>
            トップに戻る
          </button>
        </div>
      );
    }

    if (selectedLineStations.length > 0) {
      // 2. 駅選択リスト画面
      return (
        <div className="station-view-container">
          <h2 className="section-label">駅を選択</h2>
          <div className="station-grid">
            {selectedLineStations.map((s) => (
              <button
                key={s.id}
                className="station-select-btn"
                onClick={() => startNavigation(s)}
              >
                {s.name}
              </button>
            ))}
          </div>
          <button
            className="close-list-btn"
            onClick={() => setSelectedLineStations([])}
          >
            キャンセル
          </button>
        </div>
      );
    }

    // 3. 初期画面（路線選択）
    return (
      <div className="main-menu">
        <div className="line-selector">
          <p className="section-label">利用中の路線を選択</p>
          <div className="line-buttons">
            {lines.map((line) => (
              <button
                key={line.id}
                className="line-btn"
                style={{ backgroundColor: line.color }}
                onClick={() => handleLineClick(line.id)}
              >
                {line.name}
              </button>
            ))}
          </div>
        </div>
        <button className="big-emergency-btn" disabled={isLoading}>
          {isLoading ? "読み込み中..." : "🚨 現在地から最寄りを検索"}
        </button>
      </div>
    );
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1 className="title">IBS Relief Map AI</h1>
        {renderContent()}
      </header>
    </div>
  );
}

export default App;
