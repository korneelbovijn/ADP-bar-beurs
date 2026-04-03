require("dotenv").config();
const { Pool } = require("pg");
const { barItems } = require("./config");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function seed() {
  try {
    const bestaande = await pool.query("SELECT id, naam FROM baritem");
    const bestaandeMap = new Map(bestaande.rows.map((r) => [r.naam.toLowerCase(), r.id]));
    const nieuweNamen = new Set(barItems.map((i) => i.naam.toLowerCase()));

    // Verwijder items die niet meer in config staan
    for (const [naam, id] of bestaandeMap) {
      if (!nieuweNamen.has(naam)) {
        await pool.query("DELETE FROM baritemprijsdetail WHERE baritem_id = $1", [id]);
        await pool.query("DELETE FROM barverkoopitem WHERE baritem_id = $1", [id]);
        await pool.query("DELETE FROM baritem WHERE id = $1", [id]);
        console.log(`🗑️  Verwijderd: ${naam}`);
      }
    }

    // Update bestaande of voeg nieuwe toe
    for (const item of barItems) {
      const id = bestaandeMap.get(item.naam.toLowerCase());
      if (id) {
        await pool.query(
          "UPDATE baritem SET foto = $1, minimumprijs = $2, maximumprijs = $3, huidigeprijs = $4 WHERE id = $5",
          [item.foto, item.minPrijs, item.maxPrijs, item.startPrijs, id]
        );
        console.log(`✏️  Bijgewerkt: ${item.naam}`);
      } else {
        await pool.query(
          "INSERT INTO baritem (naam, foto, minimumprijs, maximumprijs, huidigeprijs, available) VALUES ($1, $2, $3, $4, $5, true)",
          [item.naam, item.foto, item.minPrijs, item.maxPrijs, item.startPrijs]
        );
        console.log(`➕ Toegevoegd: ${item.naam}`);
      }
    }

    console.log("\n✅ Database gesynchroniseerd met config.js");

    const result = await pool.query(
      "SELECT naam, minimumprijs, maximumprijs, huidigeprijs FROM baritem ORDER BY naam"
    );
    console.log("\nHuidige drankjes:");
    result.rows.forEach((r) =>
      console.log(`  ${r.naam.padEnd(20)} min €${r.minimumprijs} | max €${r.maximumprijs} | start €${r.huidigeprijs}`)
    );
  } catch (err) {
    console.error("❌ Fout:", err.message);
  } finally {
    await pool.end();
  }
}

seed();
