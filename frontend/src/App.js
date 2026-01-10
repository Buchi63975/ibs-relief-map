import React, { useState, useEffect } from "react";
import "./App.css";

// --- 設定エリア ---
const ODPT_KEY =
  "3ajj8d8clgnedp3ea1248ccq9iythkds9ipunph5m9dfw13yu5lqq6p1ny8t3b4t";
const ODPT_BASE_URL = "https://api.odpt.org/api/v4";

const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

// --- 【更新】路線ごとの詳細設定（田園都市線・半蔵門線を追加） ---
const LINE_CONFIG = {
  saikyo: {
    operator: "JR-East",
    odptLine: "Saikyo",
    toilet:
      "2号車または10号車付近のエスカレーターを上がると南口改札内にあります。",
    avgTravel: 15,
    color: "#00ac9a",
  },
  yamanote: {
    operator: "JR-East",
    odptLine: "Yamanote",
    toilet:
      "11号車（一番前）または7号車付近の階段・エスカレーターがトイレに近いです。",
    avgTravel: 10,
    color: "#9acd32",
  },
  chuo: {
    operator: "JR-East",
    odptLine: "ChuoQuick",
    toilet:
      "1号車付近の階段を降りた「中央改札内」コンコースに大きなトイレがあります。",
    avgTravel: 12,
    color: "#f15a22",
  },
  shonan: {
    operator: "JR-East",
    odptLine: "ShonanShinjuku",
    toilet:
      "ホームの南端（新宿寄り）にあるエスカレーター付近の改札内にトイレがあります。",
    avgTravel: 15,
    color: "#e21b13",
  },
  denentoshi: {
    operator: "Tokyu",
    odptLine: "DenEnToshi",
    toilet:
      "各駅の改札付近に設置されています。渋谷駅は地下1階のA8出口付近が近いです。",
    avgTravel: 18,
    color: "#20af3c",
  },
  hanzomon: {
    operator: "TokyoMetro",
    odptLine: "Hanzomon",
    toilet:
      "ホーム中央付近のエスカレーターを上がった改札内にトイレがある駅が多いです。",
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

  // --- 1. 初期データ読み込み（新しい路線IDを追加） ---
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/lines`)
      .then((res) => res.json())
      .then(setLines);

    // 【修正】取得する路線IDに新路線を追加
    const lineIds = [
      "yamanote",
      "chuo",
      "saikyo",
      "shonan",
      "denentoshi",
      "hanzomon",
    ];
    lineIds.forEach((id) => {
      fetch(`${API_BASE_URL}/api/stations?line_id=${id}`)
        .then((res) => res.json())
        .then((data) => setAllStations((prev) => [...prev, ...data]));
    });
  }, []);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev - 10 <= 0 ? 0 : prev - 10));
    }, 10);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // --- 3. ナビゲーション開始（ODPT API連携） ---
  const startNavigation = async (targetStation, isManual = false) => {
    setIsLoading(true);
    setArrivalStation(targetStation.name);
    setSelectedLineStations([]);

    try {
      const lineKey = targetStation.line_id;
      // LINE_CONFIGから設定を取得（会社名と路線名）
      const config = LINE_CONFIG[lineKey] || LINE_CONFIG["yamanote"];

      const stationNameEn = targetStation.name_en || "Shibuya";

      // 【重要】鉄道会社(config.operator)と路線名(config.odptLine)を動的に組み込む
      const odptStationId = `odpt.Station:${config.operator}.${config.odptLine}.${stationNameEn}`;

      const timetableUrl = `${ODPT_BASE_URL}/odpt:StationTimetable?odpt:station=${odptStationId}&acl:consumerKey=${ODPT_KEY}`;
      const ttRes = await fetch(timetableUrl);
      const ttData = await ttRes.json();

      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      let waitMinutes = 5;

      if (ttData && ttData.length > 0) {
        const dayType =
          now.getDay() === 0 || now.getDay() === 6
            ? "odpt.Calendar:SaturdayHoliday"
            : "odpt.Calendar:Weekday";

        const timetable =
          ttData.find((t) => t["odpt:calendar"] === dayType) || ttData[0];

        const nextTrain = timetable["odpt:stationTimetableObject"].find(
          (obj) => {
            const [h, m] = obj["odpt:departureTime"].split(":").map(Number);
            return h * 60 + m > currentMin;
          }
        );
        if (nextTrain) {
          const [nh, nm] = nextTrain["odpt:departureTime"]
            .split(":")
            .map(Number);
          waitMinutes = nh * 60 + nm - currentMin;
        }
      }

      const totalPrediction = waitMinutes + config.avgTravel;

      const gptRes = await fetch(`${API_BASE_URL}/api/gpt-prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ station_name: targetStation.name }),
      });
      const gptData = await gptRes.json();

      setAiMessage(gptData.message);
      setRouteSteps([
        `今から ${waitMinutes} 分後の電車に乗車予定です`,
        `電車で約 ${config.avgTravel} 分移動します`,
        `目的地の ${targetStation.name} 駅ホームに到着`,
      ]);
      setToiletInfo(config.toilet);
      setTimeLeft(totalPrediction * 60 * 1000);
    } catch (err) {
      console.error("Navigation Error:", err);
      setAiMessage("データ取得に失敗しましたが、お尻を締めて急いで！");
      setTimeLeft(12 * 60 * 1000);
    }
    setIsLoading(false);
  };

  const handleLineClick = (lineId) => {
    const filtered = allStations.filter((s) => s.line_id === lineId);
    setSelectedLineStations(filtered);
  };

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

        {!timeLeft && (
          <div className="emergency-section">
            <button
              className="big-emergency-btn"
              onClick={handleEmergencyClick}
              disabled={isLoading}
            >
              {isLoading ? "解析中..." : "🚨 最寄りのトイレへ直行"}
            </button>
          </div>
        )}

        {timeLeft !== null && (
          <div className="countdown-card">
            <h2 className="target-station">{arrivalStation} のトイレまで</h2>
            <div className="timer-display">{formatTime(timeLeft)}</div>
            <div className="route-guide">
              <span className="guide-title">🏁 リアルタイム乗換案内</span>
              {routeSteps.map((step, index) => (
                <div key={index} className="step-item">
                  <span className="step-number">{index + 1}</span>
                  <p className="step-text">{step}</p>
                </div>
              ))}
            </div>
            <div className="toilet-location-box">
              <span className="location-label">
                📍 おすすめ乗車位置とトイレ
              </span>
              <p className="location-text">{toiletInfo}</p>
            </div>
            <div className="ai-bubble">
              <span className="ai-icon">🤖 AIサポーター:</span>
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
