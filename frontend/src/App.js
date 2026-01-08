import React, { useState, useEffect } from "react";
import "./App.css";

// APIの接続先（デバッグ時はローカル、本番はRenderのURLを使用）
const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

function App() {
  // --- 状態管理 (State) ---
  const [lines, setLines] = useState([]); // 路線一覧
  const [allStations, setAllStations] = useState([]); // 全駅データ
  const [selectedLineStations, setSelectedLineStations] = useState([]); // 選択された路線の駅リスト
  const [timeLeft, setTimeLeft] = useState(null); // カウントダウン（ミリ秒）
  const [aiMessage, setAiMessage] = useState(""); // AIからの助言
  const [isLoading, setIsLoading] = useState(false); // 読み込み中フラグ
  const [arrivalStation, setArrivalStation] = useState(""); // 目的地

  // --- 1. 初期データ取得 ---
  useEffect(() => {
    // 路線名を取得
    fetch(`${API_BASE_URL}/api/lines`)
      .then((res) => res.json())
      .then(setLines);

    // 全駅データをバックグラウンドで読み込み
    const lineIds = ["yamanote", "chuo", "saikyo", "shonan"];
    lineIds.forEach((id) => {
      fetch(`${API_BASE_URL}/api/stations?line_id=${id}`)
        .then((res) => res.json())
        .then((data) => {
          setAllStations((prev) => [...prev, ...data]);
        });
    });
  }, []);

  // --- 2. ミリ秒カウントダウンタイマー (10ms更新) ---
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const nextValue = prev - 10;
        return nextValue <= 0 ? 0 : nextValue;
      });
    }, 10);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // --- 3. ナビゲーション開始ロジック ---
  // isManual: true の場合は手動選択（具体的ルート重視）、false は自動検索（速さ重視）
  const startNavigation = async (targetStation, isManual = false) => {
    setIsLoading(true);
    setArrivalStation(targetStation.name);
    setSelectedLineStations([]); // 駅リストを閉じる

    if (!navigator.geolocation) {
      alert("GPSをONにしてください");
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // 緯度経度からおおよその距離(m)を計算
        const d = Math.sqrt(
          Math.pow(targetStation.lat - latitude, 2) +
            Math.pow(targetStation.lng - longitude, 2)
        );
        const distMeters = Math.round(d * 111000);

        try {
          const res = await fetch(`${API_BASE_URL}/api/gpt-prediction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              distance: distMeters,
              station_name: targetStation.name,
              is_manual: isManual,
            }),
          });
          const data = await res.json();
          setAiMessage(data.message);
          setTimeLeft(data.minutes * 60 * 1000); // 分をミリ秒に変換
        } catch (err) {
          setAiMessage("目的地まで全速力でお尻を締めて！");
          setTimeLeft(300 * 1000);
        }
        setIsLoading(false);
      },
      () => {
        alert("現在地が取得できません");
        setIsLoading(false);
      }
    );
  };

  // 路線ボタンが押された時：その路線の駅を抽出して表示
  const handleLineClick = (lineId) => {
    const filtered = allStations.filter((s) => s.line_id === lineId);
    setSelectedLineStations(filtered);
  };

  // 緊急自動検索ボタン：一番近い駅を探してナビ開始
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

      if (nearest) {
        startNavigation(nearest, false);
      }
    });
  };

  // --- 4. 時刻フォーマット (m:ss:ms) ---
  const formatTime = (ms) => {
    if (ms === null) return "0:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${m}:${s.toString().padStart(2, "0")}:${centiseconds
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1 className="title">IBS Relief Map AI</h1>

        {/* 路線選択セクション */}
        <div className="line-selector">
          <p className="section-label">路線から探す（駅を選んでルート案内）</p>
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

          {/* 選択された路線の駅リスト表示 */}
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

        {/* 緊急自動検索ボタン */}
        {!timeLeft && (
          <div className="emergency-section">
            <button
              className="big-emergency-btn"
              onClick={handleEmergencyClick}
              disabled={isLoading}
            >
              {isLoading ? "AI解析中..." : "🚨 現在地から自動検索"}
            </button>
            <p className="hint">
              一番近いトイレを特定して即座にナビを開始します
            </p>
          </div>
        )}

        {/* カウントダウン表示カード */}
        {timeLeft !== null && (
          <div className="countdown-card">
            <h2 className="target-station">{arrivalStation} まで</h2>
            <div className="timer-display">{formatTime(timeLeft)}</div>

            <div className="ai-bubble">
              <span className="ai-icon">🤖 AIナビゲーター:</span>
              <p className="ai-text">{aiMessage}</p>
            </div>

            {/* Googleマップ連携ボタン */}
            <button
              className="map-link-btn"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${arrivalStation}駅&travelmode=transit`,
                  "_blank"
                )
              }
            >
              🗺️ Googleマップでルート詳細を開く
            </button>

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
