import React, { useState, useEffect } from "react";
import "./App.css";

// APIの接続先（開発環境と本番環境を自動切り替え）
const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

function App() {
  // --- ステート管理 ---
  const [lines, setLines] = useState([]); // 路線一覧
  const [allStations, setAllStations] = useState([]); // 全駅データ
  const [selectedLineStations, setSelectedLineStations] = useState([]); // 選択中の路線の駅
  const [timeLeft, setTimeLeft] = useState(null); // 残り時間（ミリ秒）
  const [aiMessage, setAiMessage] = useState(""); // AIからの励まし
  const [routeSteps, setRouteSteps] = useState([]); // 移動手順リスト
  const [toiletInfo, setToiletInfo] = useState(""); // 予測されるトイレの位置
  const [isLoading, setIsLoading] = useState(false); // ローディング状態
  const [arrivalStation, setArrivalStation] = useState(""); // 目的地駅名

  // --- 1. 初期データ読み込み ---
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/lines`)
      .then((res) => res.json())
      .then(setLines);

    // 主要路線の駅データを取得
    const lineIds = ["yamanote", "chuo", "saikyo", "shonan"];
    lineIds.forEach((id) => {
      fetch(`${API_BASE_URL}/api/stations?line_id=${id}`)
        .then((res) => res.json())
        .then((data) => setAllStations((prev) => [...prev, ...data]));
    });
  }, []);

  // --- 2. 10ミリ秒精度のタイマー ---
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev - 10 <= 0 ? 0 : prev - 10));
    }, 10);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // --- 3. ナビゲーション開始（AIへのリクエスト） ---
  const startNavigation = async (targetStation, isManual = false) => {
    setIsLoading(true);
    setArrivalStation(targetStation.name);
    setSelectedLineStations([]); // リストを閉じる

    if (!navigator.geolocation) {
      alert("GPSを有効にしてください");
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        try {
          const res = await fetch(`${API_BASE_URL}/api/gpt-prediction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: latitude,
              lng: longitude,
              station_name: targetStation.name,
              is_manual: isManual,
            }),
          });
          const data = await res.json();

          // AIの回答を各ステートにセット
          setAiMessage(data.message);
          setRouteSteps(data.steps || []);
          setToiletInfo(data.toilet_info || "");
          setTimeLeft(data.minutes * 60 * 1000);
        } catch (err) {
          setAiMessage("目的地まで急いで！お尻を締めて！");
          setRouteSteps(["最短ルートで駅を目指してください。"]);
          setToiletInfo("駅に着いたらすぐに構内図を確認しましょう！");
          setTimeLeft(600 * 1000);
        }
        setIsLoading(false);
      },
      () => {
        alert("現在地を取得できませんでした。");
        setIsLoading(false);
      }
    );
  };

  // 路線ボタン押下時
  const handleLineClick = (lineId) => {
    const filtered = allStations.filter((s) => s.line_id === lineId);
    setSelectedLineStations(filtered);
  };

  // 自動検索（緊急）ボタン押下時
  const handleEmergencyClick = () => {
    if (allStations.length === 0) return;
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      let minDistance = Infinity;
      let nearest = null;
      allStations.forEach((s) => {
        const d = Math.sqrt(
          Math.pow(s.lat - latitude, 2) + Math.pow(s.lng - longitude, 2)
        );
        if (d < minDistance) {
          minDistance = d;
          nearest = s;
        }
      });
      if (nearest) startNavigation(nearest, false);
    });
  };

  // 時間のフォーマット (分:秒:ミリ秒)
  const formatTime = (ms) => {
    if (ms === null) return "0:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${m}:${s.toString().padStart(2, "0")}:${cs
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1 className="title">IBS Relief Map AI</h1>

        {/* 路線・駅選択 */}
        <div className="line-selector">
          <p className="section-label">
            路線から探す（ルート・構内トイレを表示）
          </p>
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

          {selectedLineStations.length > 0 && !timeLeft && (
            <div className="station-list-overlay">
              <div className="station-grid">
                {selectedLineStations.map((s) => (
                  <button
                    key={s.id}
                    className="station-select-btn"
                    onClick={() => startNavigation(s, true)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <button
                className="close-list-btn"
                onClick={() => setSelectedLineStations([])}
              >
                閉じる
              </button>
            </div>
          )}
        </div>

        <div className="divider" />

        {/* 自動検索ボタン */}
        {!timeLeft && (
          <div className="emergency-section">
            <button
              className="big-emergency-btn"
              onClick={handleEmergencyClick}
              disabled={isLoading}
            >
              {isLoading ? "ルート解析中..." : "🚨 現在地から自動検索"}
            </button>
          </div>
        )}

        {/* ナビゲーションカード */}
        {timeLeft !== null && (
          <div className="countdown-card">
            <h2 className="target-station">{arrivalStation} のトイレまで</h2>
            <div className="timer-display">{formatTime(timeLeft)}</div>

            {/* ルート案内 */}
            <div className="route-guide">
              <span className="guide-title">🏁 乗り換え・ルート案内</span>
              {routeSteps.map((step, index) => (
                <div key={index} className="step-item">
                  <span className="step-number">{index + 1}</span>
                  <p className="step-text">{step}</p>
                </div>
              ))}
            </div>

            {/* トイレ位置予測（ここが重要） */}
            {toiletInfo && (
              <div className="toilet-location-box">
                <span className="location-label">📍 構内トイレ予測位置</span>
                <p className="location-text">{toiletInfo}</p>
                <button
                  className="floor-map-btn"
                  onClick={() =>
                    window.open(
                      `https://www.google.com/search?q=${arrivalStation}+駅+構内図+トイレ`,
                      "_blank"
                    )
                  }
                >
                  🗺️ 公式の構内図を検索して確認
                </button>
              </div>
            )}

            {/* 励ましメッセージ */}
            <div className="ai-bubble">
              <span className="ai-icon">🤖 魂の励まし:</span>
              <p className="ai-text">{aiMessage}</p>
            </div>

            <button
              className="reset-btn"
              onClick={() => {
                setTimeLeft(null);
                setRouteSteps([]);
                setToiletInfo("");
              }}
            >
              完了・戻る
            </button>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
