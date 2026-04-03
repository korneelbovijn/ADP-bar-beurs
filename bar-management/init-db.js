require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS BarItem (
        ID            SERIAL PRIMARY KEY,
        Naam          VARCHAR(100) NOT NULL,
        Foto          VARCHAR(10),
        MinimumPrijs  NUMERIC(10, 2) NOT NULL,
        MaximumPrijs  NUMERIC(10, 2) NOT NULL,
        HuidigePrijs  NUMERIC(10, 2),
        Available     BOOLEAN NOT NULL DEFAULT true
      );
    `);
    console.log("✅ BarItem");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS BarVerkoop (
        ID          SERIAL PRIMARY KEY,
        DatumTijd   TIMESTAMP NOT NULL DEFAULT NOW(),
        TotaalPrijs NUMERIC(10, 2) NOT NULL
      );
    `);
    console.log("✅ BarVerkoop");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS BarVerkoopItem (
        ID             SERIAL PRIMARY KEY,
        BarVerkoop_ID  INTEGER NOT NULL REFERENCES BarVerkoop(ID) ON DELETE CASCADE,
        BarItem_ID     INTEGER NOT NULL REFERENCES BarItem(ID) ON DELETE CASCADE,
        Aantal         INTEGER NOT NULL,
        VerkoopPrijs   NUMERIC(10, 2) NOT NULL
      );
    `);
    console.log("✅ BarVerkoopItem");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS BarItemPrijs (
        ID        SERIAL PRIMARY KEY,
        DatumTijd TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✅ BarItemPrijs");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS BarItemPrijsDetail (
        ID               SERIAL PRIMARY KEY,
        BarItem_ID       INTEGER NOT NULL REFERENCES BarItem(ID) ON DELETE CASCADE,
        Prijs            NUMERIC(10, 2) NOT NULL,
        BarItemPrijs_ID  INTEGER NOT NULL REFERENCES BarItemPrijs(ID) ON DELETE CASCADE
      );
    `);
    console.log("✅ BarItemPrijsDetail");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS BeursStatus (
        ID          SERIAL PRIMARY KEY,
        CrashActief BOOLEAN NOT NULL DEFAULT false
      );
    `);
    // Zorg dat er altijd exact één rij is
    await pool.query(`
      INSERT INTO BeursStatus (CrashActief)
      SELECT false
      WHERE NOT EXISTS (SELECT 1 FROM BeursStatus);
    `);
    console.log("✅ BeursStatus");

    console.log("\n✅ Database initialisatie voltooid");
  } catch (err) {
    console.error("❌ Fout bij initialiseren database:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDb();
