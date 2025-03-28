import React, { useState, useEffect } from "react";
import axios from "axios";

function App() {
  const [barItems, setBarItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    fetchBarItems();

    // 📡 WebSocket verbinding maken
    const socket = new WebSocket("ws://172.20.10.3:5001");

    socket.onopen = () => {
      console.log("📡 WebSocket verbonden!");
    };

    socket.onmessage = (event) => {
      console.log("🔄 Prijzen zijn bijgewerkt via WebSocket!");
      fetchBarItems(); // Herlaad barItems (prijsupdates)
    };

    socket.onclose = () => {
      console.log("❌ WebSocket verbinding gesloten.");
    };

    return () => {
      socket.close();
    };
  }, []);

  // Haal barItems op, inclusief de laatste prijzen
  const fetchBarItems = () => {
    axios
      .get("http://172.20.10.3:5000/api/baritems")
      .then((response) => {
        console.log("Ontvangen data van backend:", response.data);
        setBarItems(response.data);
  
        // ⬇️ Update prijzen van geselecteerde items
        setSelectedItems((prevSelected) =>
          prevSelected.map((selected) => {
            const matched = response.data.find(
              (b) => b.id === selected.BarItem_ID
            );
            if (!matched) return selected;
            return {
              ...selected,
              VerkoopPrijs: matched.LaatstePrijs || matched.minimumprijs,
            };
          })
        );
      })
      .catch((error) => console.error("Error fetching data:", error));
  };
  

  const addItem = (item) => {
    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.BarItem_ID === item.id);
      if (existing) {
        return prev.map((i) =>
          i.BarItem_ID === item.id ? { ...i, Aantal: i.Aantal + 1 } : i
        );
      }
      return [
        ...prev,
        {
          BarItem_ID: item.id,
          Aantal: 1,
          VerkoopPrijs: item.LaatstePrijs || item.minimumprijs,
        },
      ];
    });
  };

  const handleCheckout = () => {
    const itemsToSend = selectedItems.map((item) => ({
      BarItem_ID: item.BarItem_ID,
      Aantal: item.Aantal,
      VerkoopPrijs: item.VerkoopPrijs || 0,
    }));

    console.log(
      "Verkoopgegevens die naar backend worden gestuurd:",
      itemsToSend
    );
    console.log(
      "Totale prijs:",
      Math.round(totaalBonnen),
      "bonnen – €" + totaalEuro.toFixed(2)
    );

    axios
      .post("http://172.20.10.3:5000/api/barverkoop", { items: itemsToSend })
      .then((response) => {
        alert(
          `Verkoop geregistreerd!\nID: ${
            response.data.verkoopID
          }\nTotaal: ${Math.round(totaalBonnen)} bonnen – €${totaalEuro.toFixed(
            2
          )}`
        );
        setSelectedItems([]); // Reset
      })
      .catch((error) => console.error("Error registering sale:", error));
  };

  const totaalBonnen = selectedItems.reduce(
    (acc, item) =>
      acc + item.Aantal * Math.round(Number(item.VerkoopPrijs) / 0.5),
    0
  );

  const totaalEuro = selectedItems.reduce(
    (acc, item) => acc + item.Aantal * Number(item.VerkoopPrijs),
    0
  );
  return (
    <div>
      <h1>Bar Verkoop</h1>
      <div>
        <h2>Beschikbare Items</h2>
        {barItems.map((item) => (
          <button
            key={item.id}
            onClick={() => addItem(item)}
            disabled={!item.available}
            style={{
              fontSize: "2rem",
              padding: "10px",
              margin: "5px",
              opacity: item.available ? 1 : 0.5,
              cursor: item.available ? "pointer" : "not-allowed",
            }}
          >
            <span style={{ fontSize: "3rem" }}>{item.foto}</span> {item.naam} (
            {Math.round(Number(item.LaatstePrijs) / 0.5)} bonnen – €
            {Number(item.LaatstePrijs).toFixed(2)})
          </button>
        ))}
      </div>
      <div>
        <h2>Geselecteerde Items</h2>
        {selectedItems.length > 0 ? (
          <ul>
            {selectedItems.map((item, index) => {
              const barItem = barItems.find((b) => b.id === item.BarItem_ID);
              return (
                <li key={index} style={{ fontSize: "2rem" }}>
                  <span style={{ fontSize: "3rem" }}>{barItem?.foto}</span>{" "}
                  {barItem?.naam} (
                  {Math.round(Number(barItem?.LaatstePrijs) / 0.5)} bonnen – €
                  {Number(barItem?.LaatstePrijs).toFixed(2)}) x{item.Aantal}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Geen items geselecteerd</p>
        )}
        {selectedItems.length > 0 && (
          <button
            onClick={handleCheckout}
            style={{ fontSize: "2rem", padding: "10px" }}
          >
            Verkoop registreren
          </button>
        )}
        {selectedItems.length > 0 && (
          <div style={{ fontSize: "2rem", marginTop: "10px" }}>
            Totaal: {Math.round(totaalBonnen)} bonnen – €{totaalEuro.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
