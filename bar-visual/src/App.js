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

function GraphPanel() {
  const [priceHistory, setPriceHistory] = useState([]);
  const [currentPrices, setCurrentPrices] = useState([]);
  const [crashMode, setCrashMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const kleurMapping = {
    Pint: "#f0c331", // bruin (bier)
    Rouge: "#A020F0", // donkerrood (rode wijn)
    Mojito: "#94bf08", // muntgroen
    "Vodka sprite": "#44b433", // zilver (neutraal/kristal)
    Baco: "#ed77a5", // donkerbruin (cola + rum)
    "Vodka cranberry": "#e60808", // felrood (cranberry)
    Wijn: "#67adc7", // paars (wijn)
    "Shot tequila": "#ccd0cc", // oranje (sterk)
    Frisdrank: "#1E90FF", // blauw (fris/limonade)
  };

  useEffect(() => {
    // Haal de status op bij laden
    axios.get("http://172.20.10.3:5000/api/beursstatus").then((res) => {
      if (res.data.crashActief) setCrashMode(true);
    });

    fetchPriceHistory();
    fetchCurrentPrices();

    // 📡 WebSocket verbinden met server
    const socket = new WebSocket("ws://172.20.10.3:5001");

    socket.onopen = () => {
      console.log("📡 WebSocket verbonden!");
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("📡 WebSocket bericht ontvangen:", data);

      if (data.message === "crash") {
        console.warn("💥 Beurscrash geactiveerd!");
        setCrashMode(true);
        fetchCurrentPrices(); // ⬅️ Huidige prijzen updaten naar minimum
      } else if (data.message === "recovery") {
        console.log("🔁 Beurscrash beëindigd");
        setCrashMode(false);
        fetchCurrentPrices(); // ⬅️ Huidige prijzen updaten naar gemiddelde
      } else {
        fetchPriceHistory();
        fetchCurrentPrices();
      }
    };

    socket.onclose = () => {
      console.log("❌ WebSocket verbinding gesloten.");
    };

    return () => {
      socket.close();
    };
  }, []);

  // 📈 Haal de prijsgeschiedenis op voor de grafiek
  const fetchPriceHistory = () => {
    axios
      .get("http://172.20.10.3:5000/api/baritemprijs/history")
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
      .get("http://172.20.10.3:5000/api/baritems/currentprice")
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
    if (data.length === 0) return;

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

      <h1>Prijzen</h1>
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
          💥 BEURSCRASH 💥
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
                {Math.round(item.huidigeprijs / 0.5)} bonnen
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default GraphPanel;
