import React, { useState, useEffect } from "react";
import "./App.css";

// --- 設定エリア ---
const ODPT_KEY =
  "3ajj8d8clgnedp3ea1248ccq9iythkds9ipunph5m9dfw13yu5lqq6p1ny8t3b4t";
const ODPT_BASE_URL = "https://api.odpt.org/api/v4";

// APIの接続先（開発環境と本番環境を自動切り替え）
const API_BASE_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:5000" : "";

// 路線ごとの詳細設定（トイレ位置・ID・平均走行時間）
const LINE_CONFIG = {
  saikyo: {
    odptId: "odpt.Railway:JR-East.Saikyo",
    toilet:
      "2号車または10号車付近のエスカレーターを上がると南口改札内にあります。",
    avgTravel: 15,
    color: "#00ac9a",
  },
  yamanote: {
    odptId: "odpt.Railway:JR-East.Yamanote",
    toilet:
      "11号車（一番前）または7号車付近の階段・エスカレーターがトイレに近いです。",
    avgTravel: 10,
    color: "#9acd32",
  },
  chuo: {
    odptId: "odpt.Railway:JR-East.ChuoQuick",
    toilet:
      "1号車付近の階段を降りた「中央改札内」コンコースに大きなトイレがあります。",
    avgTravel: 12,
    color: "#f15a22",
  },
  shonan: {
    odptId: "odpt.Railway:JR-East.ShonanShinjuku",
    toilet:
      "ホームの南端（新宿寄り）にあるエスカレーター付近の改札内にトイレがあります。",
    avgTravel: 15,
    color: "#e21b13",
  },
};

function App() {
  // --- ステート管理 ---
  const [lines, setLines] = useState([]);
  const [allStations, setAllStations] = useState([]);
  const [selectedLineStations, setSelectedLineStations] = useState([]);
  const [timeLeft, setTimeLeft] = useState(null);
  const [aiMessage, setAiMessage] = useState("");
  const [routeSteps, setRouteSteps] = useState([]);
  const [toiletInfo, setToiletInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [arrivalStation, setArrivalStation] = useState("");

  // --- 1. 初期データ読み込み ---
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/lines`)
      .then((res) => res.json())
      .then(setLines);

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

  // --- 3. ナビゲーション開始（ODPT API連携） ---
  const startNavigation = async (targetStation, isManual = false) => {
    setIsLoading(true);
    setArrivalStation(targetStation.name);
    setSelectedLineStations([]);

    try {
      // A. ODPTからリアルタイムの時刻表を取得
      // 駅IDの組み立て (例: odpt.Station:JR-East.Saikyo.Akabane)
      const lineKey = targetStation.line_id;
      const config = LINE_CONFIG[lineKey] || LINE_CONFIG["saikyo"];

      // 英語名がない場合のフォールバック（本番ではDBに英語名を持たせるのが理想）
      const stationNameEn = targetStation.name_en || "Shinjuku";
      const odptStationId = `odpt.Station:JR-East.${
        lineKey === "chuo"
          ? "ChuoQuick"
          : lineKey.charAt(0).toUpperCase() + lineKey.slice(1)
      }.${stationNameEn}`;

      const timetableUrl = `${ODPT_BASE_URL}/odpt:StationTimetable?odpt:station=${odptStationId}&acl:consumerKey=${ODPT_KEY}`;
      const ttRes = await fetch(timetableUrl);
      const ttData = await ttRes.json();

      // 現在時刻から「次の電車」を計算
      const now = new Date();
      const currentMin = now.getHours() * 60 + now.getMinutes();
      let waitMinutes = 5; // データがない場合のデフォルト

      if (ttData.length > 0) {
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

      // 予測所要時間 = 待ち時間 + 平均走行時間
      const totalPrediction = waitMinutes + config.avgTravel;

      // B. 既存のAI励ましメッセージも取得
      const gptRes = await fetch(`${API_BASE_URL}/api/gpt-prediction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ station_name: targetStation.name }),
      });
      const gptData = await gptRes.json();

      // C. 各ステートを更新（12分固定を卒業！）
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
      setTimeLeft(12 * 60 * 1000); // 失敗時のみ以前の12分を出す
    }
    setIsLoading(false);
  };

  // --- ハンドラー ---
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
