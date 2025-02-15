require('dotenv').config();
const { Pool } = require('pg');
const config = require('./config');  // Importeer configuratie

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

async function resetDatabase() {
  try {
    console.log("🔄 Database resetten...");

    await pool.query("DELETE FROM BarVerkoopItem;");
    await pool.query("DELETE FROM BarVerkoop;");
    await pool.query("DELETE FROM BarItemPrijsDetail;");
    await pool.query("DELETE FROM BarItemPrijs;");
    await pool.query("DELETE FROM BarItem;");
    
    console.log("✅ Alle data is verwijderd.");

    // Voeg nieuwe BarItems toe vanuit de config
    let insertedBarItems = [];
    for (const item of config.barItems) {
      const result = await pool.query(
        "INSERT INTO BarItem (Naam, Foto, MinimumPrijs, MaximumPrijs) VALUES ($1, $2, $3, $4) RETURNING ID",
        [item.naam, item.foto, item.minPrijs, item.maxPrijs]
      );
      insertedBarItems.push({ id: result.rows[0].id, ...item });
    }
    console.log("✅ BarItems toegevoegd:", insertedBarItems);

    const currentTimestamp = new Date();
    const prijsSet = await pool.query(
      "INSERT INTO BarItemPrijs (DatumTijd) VALUES ($1) RETURNING ID",
      [currentTimestamp]
    );
    const prijsSetID = prijsSet.rows[0].id;
    console.log("✅ Initiële prijsset aangemaakt met ID:", prijsSetID);

    // Koppel BarItems met de startprijs uit de config
    for (const item of insertedBarItems) {
      await pool.query(
        "INSERT INTO BarItemPrijsDetail (BarItem_ID, Prijs, BarItemPrijs_ID) VALUES ($1, $2, $3)",
        [item.id, item.startPrijs, prijsSetID]
      );
    }
    console.log("✅ Startprijzen ingesteld voor alle items.");
    console.log("🎉 Database setup voltooid!");
    process.exit();
  } catch (err) {
    console.error("❌ Fout bij resetten van de database:", err);
    process.exit(1);
  }
}

resetDatabase();
