import React, { useState, useEffect } from "react";
import "./App.css";

const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

function App() {
  const [lines, setLines] = useState([]);
  const [allStations, setAllStations] = useState([]);
  const [selectedLineStations, setSelectedLineStations] = useState([]);
  const [navigationData, setNavigationData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // 初回ロード時に路線一覧を取得
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/lines`)
      .then((res) => res.json())
      .then((data) => setLines(data))
      .catch((err) => console.error("路線取得エラー:", err));
    // 全駅データも取得しておく（緊急ボタンで最寄り探索に使用）
    fetch(`${API_BASE_URL}/api/stations`)
      .then((res) => res.json())
      .then((data) => setAllStations(data))
      .catch((err) => console.error("全駅データ取得エラー:", err));
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
  // station: 目的駅オブジェクト
  // currentPos: { lat, lng } を渡すと「現在地」として使用（緊急ボタン用）
  const startNavigation = async (station, currentPos = null) => {
    setIsLoading(true);
    try {
      const payload = {
        station_name: station.name,
        // API expects `lat`/`lng` to be現在地, so优先して currentPos を使う
        lat: currentPos ? currentPos.lat : station.lat,
        lng: currentPos ? currentPos.lng : station.lng,
        line_id: station.line_id,
      };

      const res = await fetch(`${API_BASE_URL}/api/gpt-prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        <button
          className="big-emergency-btn"
          onClick={handleEmergencyClick}
          disabled={isLoading}
        >
          {isLoading ? "読み込み中..." : "🚨 現在地から最寄りを検索"}
        </button>
      </div>
    );
  };

  // 緊急ボタン: 現在地から最寄り駅を探索してナビを開始する
  const handleEmergencyClick = () => {
    if (!allStations || allStations.length === 0) {
      alert("駅データを読み込み中です。少し待ってから再試行してください。");
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        let minDist = Infinity;
        let nearest = null;
        allStations.forEach((s) => {
          const d = Math.sqrt(
            Math.pow(s.lat - latitude, 2) + Math.pow(s.lng - longitude, 2)
          );
          if (d < minDist) {
            minDist = d;
            nearest = s;
          }
        });

        if (nearest) {
          // 現在地を渡してナビ開始
          startNavigation(nearest, { lat: latitude, lng: longitude });
        } else {
          alert("最寄り駅が見つかりませんでした。");
        }
        setIsLoading(false);
      },
      (err) => {
        alert(
          "位置情報の取得に失敗しました。ブラウザの位置情報許可を確認してください。"
        );
        setIsLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1 className="title">TRTA</h1>
        {renderContent()}
      </header>
    </div>
  );
}

export default App;
