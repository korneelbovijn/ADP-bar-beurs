import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const prijsPerBon = parseFloat(process.env.REACT_APP_EURO_PER_KAART) / parseFloat(process.env.REACT_APP_BONNEN_PER_KAART);

function GraphPanel() {
  const [priceHistory, setPriceHistory] = useState([]);
  const [currentPrices, setCurrentPrices] = useState([]);
  const [crashMode, setCrashMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const kleurMapping = {
    Pint: "#f0c331",
    Rouge: "#A020F0",
    Mojito: "#94bf08",
    "Vodka sprite": "#44b433",
    Baco: "#ed77a5",
    "Tequila sunrise": "#FF6B00",
    "Shot tequila": "#ccd0cc",
    Frisdrank: "#1E90FF",
  };

  useEffect(() => {
    // Haal de status op bij laden
    axios.get(`${process.env.REACT_APP_API_URL}/api/beursstatus`).then((res) => {
      if (res.data.crashActief) setCrashMode(true);
    });

    fetchPriceHistory();
    fetchCurrentPrices();

    // 📡 WebSocket verbinden met server
    let socket;
    let reconnectTimeout;

    const connect = () => {
      socket = new WebSocket(process.env.REACT_APP_WS_URL);

      socket.onopen = () => {
        console.log("📡 WebSocket verbonden!");
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("📡 WebSocket bericht ontvangen:", data);

        if (data.message === "crash") {
          console.warn("💥 Beurscrash geactiveerd!");
          setCrashMode(true);
          fetchCurrentPrices();
        } else if (data.message === "recovery") {
          console.log("🔁 Beurscrash beëindigd");
          setCrashMode(false);
          fetchCurrentPrices();
        } else {
          fetchPriceHistory();
          fetchCurrentPrices();
        }
      };

      socket.onclose = () => {
        console.log("❌ WebSocket verbinding gesloten. Herverbinden in 3s...");
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      socket.onclose = null;
      socket.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 📈 Haal de prijsgeschiedenis op voor de grafiek
  const fetchPriceHistory = () => {
    axios
      .get(`${process.env.REACT_APP_API_URL}/api/baritemprijs/history`)
      .then((response) => {
        console.log("Ontvangen prijsgeschiedenis:", response.data);
        processPriceHistory(response.data);
      })
      .catch((error) =>
        console.error("❌ Error fetching price history:", error)
      );
  };

  // 📋 Haal de huidige prijzen op voor de tabel (uit `huidigeprijs` in `baritem`)
  const fetchCurrentPrices = () => {
    axios
      .get(`${process.env.REACT_APP_API_URL}/api/baritems/currentprice`)
      .then((response) => {
        console.log("Ontvangen huidige prijzen:", response.data);
        setCurrentPrices(response.data);
      })
      .catch((error) =>
        console.error("❌ Error fetching current prices:", error)
      );
  };

  // 📊 Prijsgeschiedenis verwerken voor de grafiek
  const processPriceHistory = (data) => {
    if (data.length === 0) {
      setPriceHistory([]);
      return;
    }

    const sortedData = data.sort(
      (a, b) => new Date(a.datumtijd) - new Date(b.datumtijd)
    );

    const groupedData = {};

    sortedData.forEach(({ baritem_id, naam, prijs, datumtijd }) => {
      const timestamp = new Date(datumtijd).getTime();

      if (!groupedData[timestamp]) {
        groupedData[timestamp] = { time: timestamp };
      }
      groupedData[timestamp][naam] = parseFloat(prijs);
    });

    setPriceHistory(Object.values(groupedData));
  };

  return (
    <div
      style={{
        textAlign: "center",
        backgroundColor: darkMode ? "#1e1e1e" : "#fff",
        color: darkMode ? "#f5f5f5" : "#000",
        minHeight: "100vh",
      }}
    >
      <button
        onClick={() => setDarkMode(!darkMode)}
        style={{
          margin: "0px",
          padding: "0px 0px",
          borderRadius: "px",
          cursor: "pointer",
        }}
      >
        {darkMode ? "Light Mode" : "Dark Mode"}
      </button>

      <h2>A. De Pauw x Kerlinga</h2>
      <h1>Wall Street On The Rocks!</h1>

      {!crashMode && (
        <ResponsiveContainer width="90%" height={500}>
        <LineChart data={priceHistory}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            domain={["dataMin", "dataMax"]}
            type="number"
            scale="time"
            tickFormatter={(unixTime) =>
              new Date(unixTime).toLocaleTimeString()
            }
          />
          <YAxis domain={["auto", "auto"]} />
          <Tooltip
            labelFormatter={(unixTime) => new Date(unixTime).toLocaleString()}
          />
          <Legend />

          {priceHistory.length > 0 &&
            Object.keys(priceHistory[0])
              .filter((key) => key !== "time" && key !== "Frisdrank")

              .map((barItemNaam, index) => (
                <Line
                  key={index}
                  type="monotone"
                  dataKey={barItemNaam}
                  stroke={kleurMapping[barItemNaam] || "#000000"} // fallback kleur
                  strokeWidth={3}
                />
              ))}
        </LineChart>
      </ResponsiveContainer>
      )}

      {/* {crashMode && (
        <img src="https://bsmedia.business-standard.com/_media/bs/img/article/2024-09/20/full/1726822730-9665.jpg" width={500}></img>
      )} */}
      

      {crashMode && (
        <div
          style={{
            backgroundColor: "red",
            color: "white",
            fontSize: "3rem",
            fontWeight: "bold",
            padding: "20px",
            marginBottom: "20px",
            borderRadius: "10px",
          }}
        >
          <h1>💥 BEURSCRASH 💥</h1>
          <p>NU alle drank aan de laagste prijs</p>
        </div>
      )}

      <h2> -- Prijslijst -- </h2>
      <table
        style={{
          marginTop: "20px",
          width: "80%",
          marginLeft: "auto",
          marginRight: "auto",
          borderCollapse: "collapse",
        }}
      >
        <tbody>
          {currentPrices.map((item) => (
            <tr
              key={item.id}
              style={{
                textDecoration: item.available ? "none" : "line-through",
              }}
            >
              <td style={{ border: "none", padding: "10px" }}>
                {item.foto} {item.naam}
              </td>
              <td style={{ border: "none", padding: "10px" }}>
                {Math.round(item.huidigeprijs / prijsPerBon)} bonnen
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default GraphPanel;
