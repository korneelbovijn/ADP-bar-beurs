require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const BASE = "http://localhost:5000";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

async function post(path) {
  const res = await fetch(`${BASE}${path}`, { method: "POST" });
  return res.json();
}

async function dbCount(table) {
  const r = await pool.query(`SELECT COUNT(*) FROM ${table}`);
  return parseInt(r.rows[0].count);
}

async function run() {
  console.log("=".repeat(50));
  console.log("TEST: Reset prijzen & wis geschiedenis");
  console.log("=".repeat(50));

  // --- Test 1: Reset geschiedenis ---
  console.log("\n[1] Wis geschiedenis");

  const voorGeschiedenis = await dbCount("baritemprijs");
  console.log(`   Rijen in baritemprijs voor reset: ${voorGeschiedenis}`);

  const resGeschiedenis = await post("/api/reset/geschiedenis");
  console.log(`   API antwoord: ${JSON.stringify(resGeschiedenis)}`);

  const naGeschiedenis = await dbCount("baritemprijs");
  console.log(`   Rijen in baritemprijs na reset: ${naGeschiedenis}`);

  const historyApi = await get("/api/baritemprijs/history");
  console.log(`   /api/baritemprijs/history geeft ${historyApi.length} rijen terug`);

  if (naGeschiedenis === 0 && historyApi.length === 0) {
    console.log("   ✅ Geschiedenis correct gewist");
  } else {
    console.log("   ❌ Geschiedenis NIET correct gewist");
  }

  // --- Test 2: Reset prijzen ---
  console.log("\n[2] Reset prijzen naar startprijzen");

  // Zet eerst een prijs handmatig op een vreemde waarde
  await pool.query("UPDATE baritem SET huidigeprijs = 99 WHERE LOWER(naam) = 'mojito'");
  const voor = await pool.query("SELECT huidigeprijs FROM baritem WHERE LOWER(naam) = 'mojito'");
  console.log(`   Mojito prijs voor reset: €${voor.rows[0].huidigeprijs}`);

  const resPrijzen = await post("/api/reset/prijzen");
  console.log(`   API antwoord: ${JSON.stringify(resPrijzen)}`);

  const na = await pool.query("SELECT huidigeprijs FROM baritem WHERE LOWER(naam) = 'mojito'");
  console.log(`   Mojito prijs na reset: €${na.rows[0].huidigeprijs}`);

  if (parseFloat(na.rows[0].huidigeprijs) === 5.5) {
    console.log("   ✅ Prijzen correct gereset (verwacht €5.5)");
  } else {
    console.log(`   ❌ Prijs NIET correct gereset (verwacht €5.5, gekregen €${na.rows[0].huidigeprijs})`);
  }

  // --- Overzicht alle prijzen na reset ---
  console.log("\n[3] Alle prijzen na reset:");
  const items = await get("/api/baritems");
  items.forEach(i => console.log(`   ${i.naam.padEnd(20)} €${i.LaatstePrijs}`));

  console.log("\n" + "=".repeat(50));
  await pool.end();
}

run().catch(err => { console.error("❌ Fout:", err.message); pool.end(); });
