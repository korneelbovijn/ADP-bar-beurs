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

async function reset() {
  try {
    // Wis volledige prijsgeschiedenis
    await pool.query("DELETE FROM baritemprijsdetail");
    await pool.query("DELETE FROM baritemprijs");
    console.log("🗑️  Prijsgeschiedenis gewist");

    // Reset verkoophistorie
    await pool.query("DELETE FROM barverkoopitem");
    await pool.query("DELETE FROM barverkoop");
    console.log("🗑️  Verkoophistorie gewist");

    // Reset crash status
    await pool.query("UPDATE beursstatus SET CrashActief = false");
    console.log("🔁 Crash status gereset");

    // Reset prijzen naar startprijzen uit config
    for (const item of barItems) {
      await pool.query(
        "UPDATE baritem SET huidigeprijs = $1 WHERE LOWER(naam) = LOWER($2)",
        [item.startPrijs, item.naam]
      );
    }
    console.log("💰 Prijzen teruggezet naar startprijzen");

    const result = await pool.query(
      "SELECT naam, huidigeprijs FROM baritem ORDER BY naam"
    );
    console.log("\nHuidige prijzen:");
    result.rows.forEach((r) =>
      console.log(`  ${r.naam.padEnd(20)} €${r.huidigeprijs}`)
    );

    console.log("\n✅ Reset voltooid — klaar voor een nieuwe avond!");
  } catch (err) {
    console.error("❌ Fout:", err.message);
  } finally {
    await pool.end();
  }
}

reset();
