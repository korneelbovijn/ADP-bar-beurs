require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const cron = require('node-cron');
const WebSocket = require('ws');
const app = express();
const port = process.env.PORT || 5000;


// Database connectief
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});



async function updatePrices() {
    try {
      const result = await pool.query(`
        SELECT id, naam, minimumprijs, maximumprijs, 
               COALESCE(
                 (SELECT prijs FROM baritemprijsdetail pid 
                  JOIN baritemprijs p ON pid.baritemprijs_id = p.id 
                  WHERE pid.baritem_id = b.id 
                  ORDER BY p.datumtijd DESC LIMIT 1),
                 b.minimumprijs
               ) AS laatsteprijs
        FROM baritem b;
      `);
  
      const currentTimestamp = new Date();
      const roundedTimestamp = currentTimestamp; // new Date(Math.round(currentTimestamp.getTime() / 1000) * 1000);
  
      // Maak één prijsset aan voor deze update
      const prijsSet = await pool.query(
        "INSERT INTO baritemprijs (datumtijd) VALUES ($1) RETURNING id",
        [roundedTimestamp]
      );
      const prijsSetID = prijsSet.rows[0].id;
  
      for (const item of result.rows) {
        let newPrice = item.laatsteprijs;
        if (isNaN(newPrice) || newPrice === null) {
          newPrice = item.minimumprijs;
        }
  
        const changePercentage = 0.1;
        const increase = Math.random() > 0.5;
        newPrice = increase
          ? newPrice * (1 + changePercentage)
          : newPrice * (1 - changePercentage);
  
        newPrice = Math.max(item.minimumprijs, Math.min(newPrice, item.maximumprijs));
        newPrice = parseFloat(newPrice.toFixed(2));
  
        await pool.query(`
          INSERT INTO baritemprijsdetail (baritem_id, prijs, baritemprijs_id)
          VALUES ($1, $2, $3)
        `, [item.id, newPrice, prijsSetID]);
      }
    } catch (err) {
      console.error("Error bij het updaten van prijzen:", err.message);
    }
  }
  


// 📡 WebSocket server configuratie
const wss = new WebSocket.Server({ port: 5001 });

wss.on('connection', ws => {
    console.log("📡 Nieuwe WebSocket verbinding");

    ws.on('message', message => {
        console.log(`📨 Ontvangen: ${message}`);
    });

    ws.on('close', () => {
        console.log("❌ WebSocket verbinding gesloten");
    });
});

// Functie om WebSocket berichten naar de clients te versturen
const sendWebSocketUpdate = () => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ message: "update" }));
        }
    });
};

// Cron job om elke 5 minuten de prijzen te updaten
cron.schedule('*/1 * * * *', () => {
    console.log("🕒 Starten met prijsupdate...");
    updatePrices().then(() => {
        sendWebSocketUpdate(); // Stuur een bericht naar de WebSocket clients na een succesvolle prijsupdate
    });
});


app.use(cors());
app.use(express.json());

// 📌 Haal alle BarItems op
app.get('/api/baritems', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                b.ID, 
                b.Naam, 
                b.Foto, 
                b.MinimumPrijs, 
                b.MaximumPrijs,
                b.available,
                COALESCE(
                    (SELECT Prijs 
                     FROM BarItemPrijsDetail pid
                     JOIN BarItemPrijs p ON pid.BarItemPrijs_ID = p.ID
                     WHERE pid.BarItem_ID = b.ID
                     ORDER BY p.DatumTijd DESC 
                     LIMIT 1), 
                    b.MinimumPrijs
                ) AS "LaatstePrijs"
            FROM BarItem b;
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// 📌 Registreer een nieuwe verkoop
app.post('/api/barverkoop', async (req, res) => {
    try {
        const { items } = req.body;

        console.log("Ontvangen items:", items);

        if (!items || items.length === 0) {
            return res.status(400).json({ message: "Geen items ontvangen" });
        }

        // Stap 1: Insert verkoop en verkrijg ID
        const verkoopInsert = await pool.query(
            "INSERT INTO BarVerkoop (DatumTijd, TotaalPrijs) VALUES (NOW(), $1) RETURNING ID",
            [items.reduce((sum, item) => sum + (item.Aantal * item.VerkoopPrijs), 0)]
        );

        const verkoopID = verkoopInsert.rows[0].id;

        // Stap 2: Voeg items toe aan de verkoop
        for (const item of items) {
            console.log(`Item toevoegen: ${JSON.stringify(item)}`);

            if (!item.VerkoopPrijs) {
                return res.status(400).json({ message: "VerkoopPrijs ontbreekt voor item: " + item.BarItem_ID });
            }

            await pool.query(
                "INSERT INTO BarVerkoopItem (BarVerkoop_ID, BarItem_ID, Aantal, VerkoopPrijs) VALUES ($1, $2, $3, $4)",
                [verkoopID, item.BarItem_ID, item.Aantal, item.VerkoopPrijs]
            );
        }

        res.status(201).json({ message: "Verkoop geregistreerd", verkoopID });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

// 📌 Voeg een nieuw BarItem toe
app.post('/api/baritems', async (req, res) => {
    try {
        const { naam, foto, minimumPrijs, maximumPrijs, startPrijs } = req.body;

        // Stap 1: Voeg het nieuwe BarItem toe
        const newItem = await pool.query(
            "INSERT INTO BarItem (Naam, Foto, MinimumPrijs, MaximumPrijs) VALUES ($1, $2, $3, $4) RETURNING ID",
            [naam, foto, minimumPrijs, maximumPrijs]
        );

        const barItemID = newItem.rows[0].id;

        // Stap 2: Maak een nieuwe BarItemPrijs aan (nieuwe prijsgeschiedenis-set)
        const prijsSet = await pool.query(
            "INSERT INTO BarItemPrijs (DatumTijd) VALUES (NOW()) RETURNING ID"
        );

        const prijsSetID = prijsSet.rows[0].id;

        // Stap 3: Voeg prijzen toe voor alle bestaande BarItems
        const alleItems = await pool.query("SELECT ID, MinimumPrijs FROM BarItem");

        for (const item of alleItems.rows) {
            const prijs = item.ID === barItemID ? startPrijs : item.MinimumPrijs; // Startprijs voor nieuwe item, minprijs voor anderen
            await pool.query(
                "INSERT INTO BarItemPrijsDetail (BarItem_ID, Prijs, BarItemPrijs_ID) VALUES ($1, $2, $3)",
                [item.ID, prijs, prijsSetID]
            );
        }

        res.status(201).json({ message: "Nieuw BarItem met prijs toegevoegd" });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Fout bij toevoegen van BarItem.");
    }
});

// 📌 Verwijder een BarItem
app.patch('/api/baritems/:id/availability', async (req, res) => {
    try {
        const { id } = req.params;
        const { available } = req.body;
        await pool.query("UPDATE BarItem SET available = $1 WHERE ID = $2", [available, id]);
        sendWebSocketUpdate(); // Verstuur update naar alle clients
        res.status(200).json({ message: "Beschikbaarheid aangepast" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Fout bij aanpassen beschikbaarheid");
    }
});



// 📌 Haal de prijsgeschiedenis op
app.get('/api/baritemprijs/history', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                pid.BarItem_ID, 
                b.Naam, 
                pid.Prijs, 
                p.DatumTijd
            FROM BarItemPrijsDetail pid
            JOIN BarItemPrijs p ON pid.BarItemPrijs_ID = p.ID
            JOIN BarItem b ON pid.BarItem_ID = b.ID
            ORDER BY p.DatumTijd ASC, pid.BarItem_ID ASC;
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Fout bij ophalen van prijsgeschiedenis:", err.message);
        res.status(500).send("Server error");
    }
});


app.post('/api/baritemprijs', async (req, res) => {
    try {
        const { prijzen } = req.body;

        console.log("Ontvangen prijsupdates:", prijzen);

        if (!prijzen || !Array.isArray(prijzen)) {
            return res.status(400).json({ message: "Ongeldige data ontvangen" });
        }

        // Stap 1: Maak een nieuwe BarItemPrijs aan en sla het tijdstip op
        const prijsSet = await pool.query(
            "INSERT INTO BarItemPrijs (DatumTijd) VALUES (NOW()) RETURNING ID, DatumTijd"
        );

        const prijsSetID = prijsSet.rows[0].id;
        const prijsSetTijd = prijsSet.rows[0].DatumTijd;  // Haal de tijd van de nieuw aangemaakte BarItemPrijs op

        console.log("Nieuw prijsset aangemaakt, tijdstip:", prijsSetTijd);

        // Stap 2: Haal alle BarItems op en werk de prijzen bij
        const alleItems = await pool.query(`
            SELECT 
                b.ID AS "BarItem_ID", 
                COALESCE(( 
                    SELECT Prijs 
                    FROM BarItemPrijsDetail pid
                    JOIN BarItemPrijs p ON pid.BarItemPrijs_ID = p.ID
                    WHERE pid.BarItem_ID = b.ID
                    ORDER BY p.DatumTijd DESC
                    LIMIT 1
                ), b.MinimumPrijs) AS "LaatstePrijs"
            FROM BarItem b;
        `);

        for (const item of alleItems.rows) {
            if (!item.BarItem_ID) {
                console.error("⚠️ FOUT: BarItem_ID ontbreekt voor item:", item);
                continue;
            }

            // Vind de nieuwe prijs voor het item
            const nieuwePrijs = prijzen.find(p => p.BarItem_ID === item.BarItem_ID)?.Prijs ?? parseFloat(item.LaatstePrijs);

            console.log(`🔹 BarItem_ID: ${item.BarItem_ID}, Nieuwe prijs: €${nieuwePrijs}`);

            // Stap 3: Voeg een nieuw BarItemPrijsDetail in met dezelfde tijd als de BarItemPrijs
            await pool.query(
                "INSERT INTO BarItemPrijsDetail (BarItem_ID, Prijs, BarItemPrijs_ID) VALUES ($1, $2, $3)",
                [item.BarItem_ID, nieuwePrijs, prijsSetID]
            );
        }

        // 📡 Stuur een WebSocket bericht dat er een update is
        sendWebSocketUpdate();

        res.status(201).json({ message: "Nieuwe prijsset aangemaakt, alle items bijgewerkt" });

    } catch (err) {
        console.error("❌ Fout bij updaten van prijzen:", err.message);
        res.status(500).send("Server error");
    }
});






app.listen(port, () => {
    console.log(`Server draait op http://localhost:${port}`);
});
