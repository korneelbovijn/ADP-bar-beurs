import React, { useState, useEffect } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

function GraphPanel() {
    const [priceHistory, setPriceHistory] = useState([]);
    const [currentPrices, setCurrentPrices] = useState([]);
    const [crashMode, setCrashMode] = useState(false);


    useEffect(() => {
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
        axios.get("http://172.20.10.3:5000/api/baritemprijs/history")
            .then(response => {
                console.log("Ontvangen prijsgeschiedenis:", response.data);
                processPriceHistory(response.data);
            })
            .catch(error => console.error("❌ Error fetching price history:", error));
    };

    // 📋 Haal de huidige prijzen op voor de tabel (uit `huidigeprijs` in `baritem`)
    const fetchCurrentPrices = () => {
        axios.get("http://172.20.10.3:5000/api/baritems/currentprice") 
            .then(response => {
                console.log("Ontvangen huidige prijzen:", response.data);
                setCurrentPrices(response.data);
            })
            .catch(error => console.error("❌ Error fetching current prices:", error));
    };

    // 📊 Prijsgeschiedenis verwerken voor de grafiek
    const processPriceHistory = (data) => {
        if (data.length === 0) return;

        const sortedData = data.sort((a, b) => new Date(a.datumtijd) - new Date(b.datumtijd));

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
        <div style={{ textAlign: "center" }}>


            <h1>Prijzen</h1>
            <ResponsiveContainer width="90%" height={500}>
                <LineChart data={priceHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                        dataKey="time" 
                        domain={['dataMin', 'dataMax']} 
                        type="number" 
                        scale="time"
                        tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()}
                    />
                    <YAxis domain={["auto", "auto"]} />
                    <Tooltip labelFormatter={(unixTime) => new Date(unixTime).toLocaleString()} />
                    <Legend />

                    {priceHistory.length > 0 && Object.keys(priceHistory[0])
                        .filter(key => key !== "time")
                        .map((barItemNaam, index) => (
                          <Line 
                            key={index} 
                            type="monotone" 
                            dataKey={barItemNaam} 
                            stroke={`#${Math.floor(Math.random() * 16777215).toString(16)}`} 
                            strokeWidth={3} 
                          />
                    ))}
                </LineChart>
            </ResponsiveContainer>

            
{crashMode && (
  <div style={{
    backgroundColor: "red",
    color: "white",
    fontSize: "3rem",
    fontWeight: "bold",
    padding: "20px",
    marginBottom: "20px",
    borderRadius: "10px"
  }}>
    💥 BEURSCRASH ACTIEF 💥
  </div>
)}

            <h2>Huidige Prijzen</h2>
            <table style={{ marginTop: "20px", width: "80%", marginLeft: "auto", marginRight: "auto", borderCollapse: "collapse" }}>
                <thead>
                    <tr>
                        <th style={{ borderBottom: "1px solid #ddd", padding: "10px" }}>Product</th>
                        <th style={{ borderBottom: "1px solid #ddd", padding: "10px" }}>Huidige Prijs</th>
                    </tr>
                </thead>
                <tbody>
                    {currentPrices.map(item => (
                        <tr key={item.id} style={{ textDecoration: item.available ? "none" : "line-through" }}>
                            <td style={{ border: "none", padding: "10px" }}>
                                {item.foto} {item.naam}
                            </td>
                            <td style={{ border: "none", padding: "10px" }}>
                                €{item.huidigeprijs}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default GraphPanel;
