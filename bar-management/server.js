require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const cron = require("node-cron");
const WebSocket = require("ws");
const app = express();
const port = process.env.PORT || 5000;

const visualUpdateDelayMin = 1; // hoe vaak prijzen gelogd worden in BarItemPrijsDetail (in minuten)
const priceCalculationDelayMin = 3; // hoe vaak nieuwe prijzen berekend worden (in minuten)
const aanpassingsFactor = 0.2; // 0.2 = 20%, stel hier 0.0 tot 2.0 in (0% - 200%)


// Database connectief
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Alleen loggen (elke minuut behalve als het update-moment is)
cron.schedule(`*/${visualUpdateDelayMin} * * * *`, () => {
  const now = new Date();
  if (now.getMinutes() % priceCalculationDelayMin !== 0) {
    updatePrices(false);
  }
});

// Elke 3 minuten: prijs update + loggen
cron.schedule(`*/${priceCalculationDelayMin} * * * *`, () => {
  updatePrices(true);
});


async function updatePrices(updateHuidigePrijs = false) {
  if (await isCrashActive()) {
    console.log("🚫 Prijsupdate geblokkeerd wegens actieve crash");
    return;
  }

  try {
    const verkoopTijdspanne = 30; // Laatste 30 minuten

    // Stap 1: Haal verkoopgegevens van de laatste X minuten op
    const verkopen = await pool.query(`
            SELECT bi.id, COALESCE(SUM(bvi.aantal), 0) AS totaal_verkocht
            FROM baritem bi
            LEFT JOIN (
              SELECT bvi.*
              FROM barverkoopitem bvi
              JOIN barverkoop b ON bvi.barverkoop_id = b.id
              WHERE b.datumtijd >= NOW() - INTERVAL '${priceCalculationDelayMin} minutes'
            ) bvi ON bi.id = bvi.baritem_id
            WHERE bi.available = true AND bi.naam != 'Frisdrank'
            GROUP BY bi.id
            ORDER BY totaal_verkocht ASC;


        `);

    const verkochteItems = verkopen.rows;
    if (verkochteItems.length === 0) {
      console.log(
        "⚠️ Geen verkopen in de laatste 30 minuten. Prijzen blijven ongewijzigd."
      );
      return;
    }

    const totalItems = verkochteItems.length;

    // Stap 2: Haal de huidige prijzen van alle items op
    const huidigePrijzen = await pool.query(`
            SELECT id, naam, minimumprijs, maximumprijs, huidigeprijs as laatsteprijs 
            FROM baritem
            WHERE available = true AND naam != 'Frisdrank'


        `);

    const prijzenMap = new Map(
      huidigePrijzen.rows.map((item) => [item.id, item])
    );

    // Stap 3: Maak een nieuwe prijsgeschiedenis set aan
    const currentTimestamp = new Date();
    const prijsSet = await pool.query(
      "INSERT INTO baritemprijs (datumtijd) VALUES ($1) RETURNING id",
      [currentTimestamp]
    );
    const prijsSetID = prijsSet.rows[0].id;
    console.log(updateHuidigePrijs ? "💾 Definitieve prijsupdate" : "🧪 Simulatie van prijsupdate");

    console.log("🧾 Verkoopanalyse:");
console.log("=".repeat(60));

    // Stap 4: Bereken nieuwe prijzen
    for (let i = 0; i < totalItems; i++) {
      const item = verkochteItems[i];
      const itemData = prijzenMap.get(item.id);
      if (!itemData) continue;

      const huidigePrijs =
        parseFloat(itemData.laatsteprijs) || itemData.minimumprijs;
      let nieuwePrijs = huidigePrijs;
      let basisVerandering = itemData.maximumprijs - itemData.minimumprijs;

      // **Bepaal de aanpassingsfactor afhankelijk van de positie in de lijst**
      const normalisedIndex = i / (totalItems - 1 || 1); // Waarde tussen 0 en 1
      const extremeFactor = Math.abs(Math.cos(normalisedIndex * Math.PI));
      // Dit geeft een hoge waarde aan het begin en eind, en een lage waarde in het midden

      const maxVariatie = basisVerandering * aanpassingsFactor;

      if (i < totalItems / 2) {
        // Onderste helft → prijs dalen
        const daling = maxVariatie * extremeFactor;
        nieuwePrijs = Math.max(huidigePrijs - daling, itemData.minimumprijs);
      } else {
        // Bovenste helft → prijs stijgen
        const stijging = maxVariatie * extremeFactor;
        nieuwePrijs = Math.min(huidigePrijs + stijging, itemData.maximumprijs);
      }

      // Stap 5: Sla de nieuwe prijs op in `baritemprijsdetail`
      await pool.query(
        "INSERT INTO baritemprijsdetail (baritem_id, prijs, baritemprijs_id) VALUES ($1, $2, $3)",
        [item.id, nieuwePrijs, prijsSetID]
      );

      if (updateHuidigePrijs) {
        // console.log("prijzen doorvoeren")
        await pool.query("UPDATE baritem SET huidigeprijs = $1 WHERE id = $2", [
          nieuwePrijs,
          item.id,
        ]);
      }


      const prijsVerschil = nieuwePrijs - huidigePrijs;
      const richting =
        prijsVerschil > 0
          ? "⬆️ gestegen"
          : prijsVerschil < 0
          ? "⬇️ gedaald"
          : "➡️ gelijk gebleven";

      console.log(
        `🔹 ${itemData.naam.padEnd(20)} | Verkocht: ${item.totaal_verkocht
          .toString()
          .padStart(3)} stuks | Prijs ${richting} met €${Math.abs(
          prijsVerschil
        ).toFixed(2)}`
      );
    }
    console.log("=".repeat(60));


    // WebSocket update sturen
    sendWebSocketUpdate();

    console.log("✅ Prijzen succesvol bijgewerkt!");
  } catch (err) {
    console.error("❌ Fout bij updaten van prijzen:", err.message);
  }
}

async function isCrashActive() {
  const result = await pool.query(
    "SELECT CrashActief FROM BeursStatus LIMIT 1"
  );
  return result.rows[0]?.crashactief === true;
}

async function setCrashStatus(status) {
  await pool.query("UPDATE BeursStatus SET CrashActief = $1", [status]);
}

async function toggleCrash() {
  const current = await isCrashActive();

  if (!current) {
    console.log("💥 Crash geactiveerd");
    await setCrashStatus(true);

    const prijzen = await pool.query(`SELECT ID, MinimumPrijs FROM BarItem`);
    for (const item of prijzen.rows) {
      await pool.query("UPDATE BarItem SET huidigeprijs = $1 WHERE ID = $2", [
        parseFloat(item.minimumprijs),
        item.id,
      ]);
    }

    sendWebSocketUpdate({ message: "crash" });
  } else {
    console.log("🔁 Crash beëindigd – herstel naar gemiddelde");
    await setCrashStatus(false);

    const prijzen = await pool.query(
      `SELECT ID, MinimumPrijs, MaximumPrijs FROM BarItem`
    );
    for (const item of prijzen.rows) {
      const gemiddelde =
        (parseFloat(item.minimumprijs) + parseFloat(item.maximumprijs)) / 2;
      await pool.query("UPDATE BarItem SET huidigeprijs = $1 WHERE ID = $2", [
        gemiddelde,
        item.id,
      ]);
    }

    sendWebSocketUpdate({ message: "recovery" });
  }
}

// 📡 WebSocket server configuratie
const wss = new WebSocket.Server({ port: 5001 });

wss.on("connection", (ws) => {
  console.log("📡 Nieuwe WebSocket verbinding");

  ws.on("message", (message) => {
    const data = JSON.parse(message);
    console.log(`📨 Ontvangen: ${message}`);

    if (data.message === "crash") {
      toggleCrash(); // Enige functie nodig
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket verbinding gesloten");
  });
});

// Functie om WebSocket berichten naar de clients te versturen
const sendWebSocketUpdate = (data = { message: "update" }) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

app.use(cors());
app.use(express.json());

// 📌 Haal alle BarItems op
app.get("/api/baritems", async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT 
            b.ID, 
            b.Naam, 
            b.Foto, 
            b.MinimumPrijs, 
            b.MaximumPrijs,
            b.available,
            b.huidigeprijs AS "LaatstePrijs"
            FROM BarItem b;
        `);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// 📌 Registreer een nieuwe verkoop
app.post("/api/barverkoop", async (req, res) => {
  try {
    const { items } = req.body;

    console.log("Ontvangen items:", items);

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Geen items ontvangen" });
    }

    // Stap 1: Insert verkoop en verkrijg ID
    const verkoopInsert = await pool.query(
      "INSERT INTO BarVerkoop (DatumTijd, TotaalPrijs) VALUES (NOW(), $1) RETURNING ID",
      [items.reduce((sum, item) => sum + item.Aantal * item.VerkoopPrijs, 0)]
    );

    const verkoopID = verkoopInsert.rows[0].id;

    // Stap 2: Voeg items toe aan de verkoop
    for (const item of items) {
      console.log(`Item toevoegen: ${JSON.stringify(item)}`);

      if (!item.VerkoopPrijs) {
        return res.status(400).json({
          message: "VerkoopPrijs ontbreekt voor item: " + item.BarItem_ID,
        });
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
app.post("/api/baritems", async (req, res) => {
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
app.patch("/api/baritems/:id/availability", async (req, res) => {
  try {
    const { id } = req.params;
    const { available } = req.body;
    await pool.query("UPDATE BarItem SET available = $1 WHERE ID = $2", [
      available,
      id,
    ]);
    sendWebSocketUpdate(); // Verstuur update naar alle clients
    res.status(200).json({ message: "Beschikbaarheid aangepast" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Fout bij aanpassen beschikbaarheid");
  }
});

// 📌 Haal de prijsgeschiedenis op
app.get("/api/baritemprijs/history", async (req, res) => {
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

// 📌 Haal de huidige prijzen op uit de baritem-tabel
app.get("/api/baritems/currentprice", async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT 
                id, 
                naam, 
                foto, 
                minimumprijs, 
                maximumprijs, 
                available, 
                huidigeprijs 
            FROM baritem;
        `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Fout bij ophalen van huidige prijzen:", err.message);
    res.status(500).send("Server error");
  }
});

app.post("/api/baritemprijs", async (req, res) => {
  try {
    const { prijzen } = req.body;

    console.log("Ontvangen prijsupdates:", prijzen);

    if (!prijzen || !Array.isArray(prijzen)) {
      return res.status(400).json({ message: "Ongeldige data ontvangen" });
    }

    for (const { BarItem_ID, Prijs } of prijzen) {
      if (!BarItem_ID || Prijs === null || Prijs === undefined) {
        console.warn(
          `⚠️ Ongeldige prijs voor item ${BarItem_ID}, wordt overgeslagen`
        );
        continue;
      }

      await pool.query("UPDATE BarItem SET huidigeprijs = $1 WHERE ID = $2", [
        Prijs,
        BarItem_ID,
      ]);
      console.log(`🔹 BarItem_ID: ${BarItem_ID} → huidigeprijs = €${Prijs}`);
    }

    sendWebSocketUpdate();

    res.status(200).json({ message: "✅ huidigeprijs succesvol aangepast" });
  } catch (err) {
    console.error("❌ Fout bij aanpassen van huidigeprijs:", err.message);
    res.status(500).send("Server error");
  }
});

app.get("/api/beursstatus", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT CrashActief FROM BeursStatus LIMIT 1"
    );
    res.json({ crashActief: result.rows[0]?.crashactief });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Fout bij ophalen beursstatus");
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server draait op http://0.0.0.0:${port}`);
});
