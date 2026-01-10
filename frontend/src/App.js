import React, { useState, useEffect } from "react";
import "./App.css";

const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

const LINE_CONFIG = {
  yamanote: { color: "#008000" },
  chuo: { color: "#ff8c00" },
  saikyo: { color: "#00ac9a" },
  shonan: { color: "#e62222" },
  denentoshi: { color: "#20af3c" },
  hanzomon: { color: "#9b7cb6" },
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

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/lines`)
      .then((res) => res.json())
      .then((data) => {
        setLines(data);
        console.log("✅ 取得した路線一覧:", data);
      })
      .catch((err) => console.error("路線取得失敗:", err));

    fetch(`${API_BASE_URL}/api/stations`)
      .then((res) => res.json())
      .then((data) => setAllStations(data))
      .catch((err) => console.error("全駅データ取得失敗:", err));
  }, []);

  const handleLineClick = async (lineId) => {
    // 徹底的に掃除。引用符が含まれている可能性を排除
    const cleanLineId = String(lineId)
      .trim()
      .toLowerCase()
      .replace(/['"]+/g, "");
    console.log(`🔍 リクエスト送信開始: ID="${cleanLineId}"`);

    setIsLoading(true);
    setSelectedLineStations([]);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/stations?line_id=${cleanLineId}`
      );
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

      const data = await res.json();
      console.log(`📡 受信データ:`, data);

      if (data && data.length > 0) {
        setSelectedLineStations(data);
      } else {
        // 画面にエラーを出して原因を可視化する
        alert(
          `路線「${cleanLineId}」の駅データが0件でした。サーバー側のstations.py内のline_idを確認してください。`
        );
      }
    } catch (err) {
      console.error("駅データ取得エラー:", err);
      alert("通信エラーが発生しました。");
    } finally {
      setIsLoading(false);
    }
  };

  // --- StartNavigation, HandleEmergencyClick, FormatTime は以前と同じ ---
  const startNavigation = async (targetStation, isManual = false) => {
    setIsLoading(true);
    setArrivalStation(targetStation.name);
    setSelectedLineStations([]);
    try {
      const gptRes = await fetch(`${API_BASE_URL}/api/gpt-prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_name: targetStation.name,
          lat: targetStation.lat,
          lng: targetStation.lng,
          line_id: targetStation.line_id,
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
      setAiMessage("通信エラー！駅の案内図を確認してください。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmergencyClick = () => {
    if (allStations.length === 0) {
      alert("駅データを読み込み中です。");
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
        if (nearest) startNavigation(nearest, false);
      },
      () => {
        alert("位置情報の取得に失敗しました。");
        setIsLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

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
                {lines.map((line) => {
                  const cleanId = String(line.id)
                    .trim()
                    .toLowerCase()
                    .replace(/['"]+/g, "");
                  console.log("render line button:", cleanId, line);
                  return (
                    <button
                      key={line.id}
                      className="line-btn"
                      data-line={cleanId}
                      style={{
                        backgroundColor: LINE_CONFIG[cleanId]?.color || "#666",
                      }}
                      onClick={(e) => {
                        console.log("line button clicked:", cleanId, e);
                        handleLineClick(cleanId);
                      }}
                    >
                      {line.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="emergency-section">
              <button
                className="big-emergency-btn"
                onClick={handleEmergencyClick}
                disabled={isLoading}
              >
                {isLoading && !selectedLineStations.length
                  ? "解析中..."
                  : "🚨 最寄りのトイレへ直行"}
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
