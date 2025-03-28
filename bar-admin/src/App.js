import React, { useState, useEffect, useRef} from "react";
import axios from "axios";

function AdminPanel() {

    const [loggedIn, setLoggedIn] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [barItems, setBarItems] = useState([]);
    const [newPrices, setNewPrices] = useState([]);
    const socket = new WebSocket("ws://172.20.10.3:5001");
    const socketRef = useRef(null);



    useEffect(() => {
      fetchBarItems();
  
      socketRef.current = new WebSocket("ws://172.20.10.3:5001");
  
      socketRef.current.onopen = () => {
          console.log("📡 WebSocket verbonden met server");
      };
  
      socketRef.current.onclose = () => {
          console.log("❌ WebSocket gesloten");
      };
  
      return () => {
          socketRef.current.close();
      };
  }, []);
  

    const fetchBarItems = () => {
        axios.get("http://172.20.10.3:5000/api/baritems")
            .then(response => setBarItems(response.data))
            .catch(error => console.error("Error fetching data:", error));
    };

    const handleLogin = () => {
      if (username === "123" && password === "123") {
          setLoggedIn(true);
      } else {
          alert("❌ Ongeldige inloggegevens");
      }
  };

    const handlePriceChange = (id, prijs) => {
        setNewPrices(prev => {
            const existing = prev.find(p => p.BarItem_ID === id);
            if (existing) {
                return prev.map(p => p.BarItem_ID === id ? { ...p, Prijs: prijs !== "" ? parseFloat(prijs) : null } : p);
            }
            return [...prev, { BarItem_ID: id, Prijs: prijs !== "" ? parseFloat(prijs) : null }];
        });
    };

    const generateRandomPrices = () => {
      const updatedPrices = barItems.map(item => {
          const minPrice = parseFloat(item.minimumprijs);
          const maxPrice = parseFloat(item.maximumprijs);
  
          // Controleer of de prijzen correct zijn geparseerd
          if (isNaN(minPrice) || isNaN(maxPrice)) {
              console.error(`❌ Ongeldige prijzen voor ${item.naam}: min=${item.minimumprijs}, max=${item.maximumprijs}`);
              return null; // Sla over als de prijs ongeldig is
          }
  
          const randomPrice = (Math.random() * (maxPrice - minPrice) + minPrice).toFixed(2);
          return { BarItem_ID: item.id, Prijs: parseFloat(randomPrice) };
      }).filter(price => price !== null); // Verwijder items met ongeldig prijsbereik
  
      console.log("🚀 Willekeurige gegenereerde prijzen:", updatedPrices);
      setNewPrices(updatedPrices);
  };
  

    const handleUpdatePrices = () => {
        if (newPrices.length === 0) {
            console.warn("⚠️ Geen prijsupdates geregistreerd, gebruik vorige prijzen.");
            return;
        }

        axios.post("http://172.20.10.3:5000/api/baritemprijs", { prijzen: newPrices })
            .then(() => {
                console.log("✅ Prijsupdates succesvol verzonden:", newPrices);
                fetchBarItems();
                setNewPrices([]);
            })
            .catch(error => console.error("❌ Fout bij het updaten van prijzen:", error));
    };

    const toggleAvailability = (id, newStatus) => {
        axios.patch(`http://172.20.10.3:5000/api/baritems/${id}/availability`, { available: newStatus })
          .then(() => fetchBarItems())
          .catch(error => console.error("Error updating availability:", error));
      };

      if (!loggedIn) {
        return (
            <div style={{ padding: "20px", fontSize: "1.5rem" }}>
                <h2>Admin Inloggen</h2>
                <input
                    type="text"
                    placeholder="Gebruikersnaam"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                /><br /><br />
                <input
                    type="password"
                    placeholder="Wachtwoord"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                /><br /><br />
                <button onClick={handleLogin}>Login</button>
            </div>
        );
    }
      

    return (
        <div>
            <h1>Admin Panel - Prijzen Beheren</h1>

            <button onClick={generateRandomPrices} style={{ marginBottom: "10px", padding: "10px" }}>
                Genereer Willekeurige Prijzen
            </button>

            <button
              onClick={() => {
                if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                  socketRef.current.send(JSON.stringify({ message: "crash" }));
                } else {
                  console.warn("🚫 WebSocket is niet open.");
                }
              }}
              style={{ marginBottom: "10px", padding: "10px", marginLeft: "10px", backgroundColor: "red", color: "white" }}
            >
              💥 Beurscrash
            </button>



            <table border="1">
                <thead>
                    <tr>
                        <th>Emoji</th>
                        <th>Naam</th>
                        <th>Laatste Prijs</th>
                        <th>Nieuwe Prijs</th>
                    </tr>
                </thead>
                <tbody>
  {barItems.map(item => (
    <tr key={item.id}>
      <td style={{ fontSize: "2rem" }}>{item.foto}</td>
      <td style={{ textDecoration: !item.available ? 'line-through' : 'none' }}>
        {item.naam}
      </td>
      <td>€{item.LaatstePrijs}</td>
      <td>
        <input
          type="number"
          placeholder={`€${item.LaatstePrijs}`}
          value={newPrices.find(p => p.BarItem_ID === item.id)?.Prijs || ""}
          onChange={(e) => handlePriceChange(item.id, e.target.value)}
        />
      </td>
      <td>
        <button onClick={() => toggleAvailability(item.id, !item.available)}>
          {item.available ? 'Markeer als Uitverkocht' : 'Markeer als Beschikbaar'}
        </button>
      </td>
    </tr>
  ))}
</tbody>

            </table>

            <button onClick={handleUpdatePrices} style={{ marginTop: "10px", padding: "10px" }}>
                Prijzen Updaten
            </button>
        </div>
    );
}

export default AdminPanel;
