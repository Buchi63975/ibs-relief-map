import React, { useState, useEffect } from "react";
import "./App.css";

// 1. 環境設定
const ODPT_KEY =
  "3ajj8d8clgnedp3ea1248ccq9iythkds9ipunph5m9dfw13yu5lqq6p1ny8t3b4t";
const ODPT_BASE_URL = "https://api.odpt.org/api/v4";
const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

const LINE_CONFIG = {
  saikyo: {
    operator: "JR-East",
    odptLine: "Saikyo",
    avgTravel: 15,
    color: "#00ac9a",
  },
  yamanote: {
    operator: "JR-East",
    odptLine: "Yamanote",
    avgTravel: 10,
    color: "#9acd32",
  },
  chuo: {
    operator: "JR-East",
    odptLine: "ChuoQuick",
    avgTravel: 12,
    color: "#f15a22",
  },
  shonan: {
    operator: "JR-East",
    odptLine: "ShonanShinjuku",
    avgTravel: 15,
    color: "#e21b13",
  },
  denentoshi: {
    operator: "Tokyu",
    odptLine: "DenEnToshi",
    avgTravel: 18,
    color: "#20af3c",
  },
  hanzomon: {
    operator: "TokyoMetro",
    odptLine: "Hanzomon",
    avgTravel: 14,
    color: "#9b7cb6",
  },
};

function App() {
  const [lines, setLines] = useState([]);
  const [allStations, setAllStations] = useState([]);
  const [selectedLineStations, setSelectedLineStations] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);
  const [aiMessage, setAiMessage] = useState("");
  const [routeSteps, setRouteSteps] = useState([]);
  const [toiletInfo, setToiletInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [arrivalStation, setArrivalStation] = useState("");

  // --- 修正1: データの取得方法を「一括取得」にシンプル化 ---
  useEffect(() => {
    // 1. 路線一覧を取得
    fetch(`${API_BASE_URL}/api/lines`)
      .then((res) => res.json())
      .then(setLines)
      .catch((err) => console.error("路線取得失敗:", err));

    // 2. 全駅データを一括取得（サーバー側の修正済みmain.pyに対応）
    // 個別にfetchするのではなく、一度の通信で全駅（長津田含む）を取得します
    fetch(`${API_BASE_URL}/api/stations`)
      .then((res) => res.json())
      .then((data) => {
        setAllStations(data);
        console.log(`✅ 駅データ同期完了: ${data.length}件の駅を認識しました`);
      })
      .catch((err) => console.error("駅データ取得失敗:", err));
  }, []);

  // --- 修正2: ボタンが反応するようにフィルタリングを修正 ---
  const handleLineClick = (lineId) => {
    console.log("選択された路線ID:", lineId);
    const filtered = allStations.filter((s) => s.line_id === lineId);
    if (filtered.length === 0) {
      alert("駅データがまだ読み込まれていないか、該当する駅がありません。");
    }
    setSelectedLineStations(filtered);
  };

  // --- 修正3: AI予測の呼び出し ---
  const startNavigation = async (targetStation, isManual = false) => {
    setIsLoading(true);
    setArrivalStation(targetStation.name);
    setSelectedLineStations([]);

    try {
      const config =
        LINE_CONFIG[targetStation.line_id] || LINE_CONFIG["yamanote"];

      // Gemini API 呼び出し
      const gptRes = await fetch(`${API_BASE_URL}/api/gpt-prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_name: targetStation.name,
          lat: targetStation.lat,
          lng: targetStation.lng,
          is_manual: isManual,
        }),
      });
      const gptData = await gptRes.json();

      setAiMessage(gptData.message);
      setToiletInfo(gptData.toilet_info);
      setRouteSteps(
        gptData.steps || [`${targetStation.name}へ向かってください`]
      );
      setTimeLeft((gptData.minutes || 10) * 60 * 1000);
    } catch (err) {
      console.error("AI連携失敗:", err);
      setAiMessage("通信エラー！お尻を締めて駅へ急いで！");
    }
    setIsLoading(false);
  };

  const handleEmergencyClick = () => {
    if (allStations.length === 0) {
      alert("データ準備中。1〜2秒待ってから再度押してください。");
      return;
    }
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
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
          console.log("最寄駅として判定:", nearest.name);
          startNavigation(nearest, false);
        }
      },
      () => {
        alert("位置情報の取得に失敗しました。");
        setIsLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  // 時間フォーマット関数
  const formatTime = (ms) => {
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

        {!timeLeft && (
          <>
            <div className="line-selector">
              <p className="section-label">路線を選択してトイレを検索</p>
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

            <div className="emergency-section">
              <button
                className="big-emergency-btn"
                onClick={handleEmergencyClick}
                disabled={isLoading}
              >
                {isLoading ? "解析中..." : "🚨 最寄りのトイレへ直行"}
              </button>
            </div>
          </>
        )}

        {selectedLineStations.length > 0 && !timeLeft && (
          <div className="station-list-overlay">
            <div className="station-grid">
              {selectedLineStations.map((s) => (
                <button
                  key={`${s.line_id}-${s.id}`}
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

        {timeLeft !== null && (
          <div className="countdown-card">
            <h2 className="target-station">{arrivalStation} のトイレまで</h2>
            <div className="timer-display">{formatTime(timeLeft)}</div>
            <div className="route-guide">
              <span className="guide-title">🏁 到着までの手順</span>
              {routeSteps.map((step, i) => (
                <div key={i} className="step-item">
                  <p className="step-text">{step}</p>
                </div>
              ))}
            </div>
            <div className="toilet-location-box">
              <span className="location-label">📍 AIによるトイレ位置詳細</span>
              <p className="location-text">{toiletInfo}</p>
            </div>
            <div className="ai-bubble">
              <p className="ai-text">🤖 {aiMessage}</p>
            </div>
            <button
              className="reset-btn"
              onClick={() => {
                setTimeLeft(null);
                setRouteSteps([]);
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
