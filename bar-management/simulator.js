/**
 * Bar-Beurs Prijssimulator
 * Simuleert avonden in versneld tempo en controleert of het prijsalgoritme gezond blijft.
 * Geen database nodig — volledig in memory.
 *
 * Gebruik: node simulator.js
 * Opties:
 *   --cycli=20        aantal prijsrondes (default 20, = ~5u avond bij 15min/ronde)
 *   --aankopen=30     gemiddeld aankopen per ronde (default 30)
 *   --factor=0.2      aanpassingsFactor (default uit config)
 *   --runs=3          aantal simulaties naast elkaar (default 3)
 */

const { barItems: configItems } = require("./config");

// --- CLI argumenten ---
const args = Object.fromEntries(
  process.argv.slice(2).map(a => a.replace("--", "").split("="))
);
const CYCLI        = parseInt(args.cycli     ?? 20);
const AANKOPEN     = parseInt(args.aankopen  ?? 30);
const FACTOR       = parseFloat(args.factor  ?? 0.2);
const RUNS         = parseInt(args.runs      ?? 3);

// --- Realistische basisvraag per drank ---
// Hogere waarde = meer basisvoorkeur (los van prijs)
const BASISVOORKEUR = {
  "Pint":            3.0,   // bier altijd populair
  "Rouge":           2.0,   // ook populair
  "Shot tequila":    2.5,   // shotjes gaan snel
  "Frisdrank":       1.5,   // chauffeurs / nuchteren
  "Mojito":          1.2,
  "Vodka sprite":    1.2,
  "Baco":            1.0,
  "Tequila sunrise": 1.0,
};

// --- Hulpfuncties ---
function kloon(items) {
  return items.map(i => ({ ...i, huidigePrijs: i.startPrijs, verkopen: 0 }));
}

function gewichtenBerekenen(dranken) {
  // Gewicht = basisvoorkeur × (1 / genormaliseerde prijs)
  // Goedkopere drank (relatief t.o.v. range) → hogere kans
  return dranken.map(d => {
    const basis = BASISVOORKEUR[d.naam] ?? 1.0;
    if (d.minPrijs === d.maxPrijs) return { ...d, gewicht: basis }; // vaste prijs
    const norm = (d.huidigePrijs - d.minPrijs) / (d.maxPrijs - d.minPrijs); // 0=min, 1=max
    const prijsFactor = 1.5 - norm; // duur=0.5, goedkoop=1.5
    return { ...d, gewicht: basis * prijsFactor };
  });
}

function kiesRandomDrank(dranken) {
  const gewogen = gewichtenBerekenen(dranken);
  const totaal  = gewogen.reduce((s, d) => s + d.gewicht, 0);
  let rand = Math.random() * totaal;
  for (const d of gewogen) {
    rand -= d.gewicht;
    if (rand <= 0) return d.naam;
  }
  return gewogen[gewogen.length - 1].naam;
}

function simuleerAankopen(dranken, aantalAankopen) {
  // Varieer het aantal aankopen een beetje (rustige vs drukke momenten)
  const variatie = Math.floor(aantalAankopen * (0.5 + Math.random()));
  const verkopen = Object.fromEntries(dranken.map(d => [d.naam, 0]));
  for (let i = 0; i < variatie; i++) {
    verkopen[kiesRandomDrank(dranken)]++;
  }
  return verkopen;
}

function berekeningNieuwePrijzen(dranken, verkopen) {
  // Exact hetzelfde algoritme als server.js
  const actief = dranken.filter(d => d.minPrijs < d.maxPrijs);
  const gesorteerd = [...actief].sort((a, b) => verkopen[a.naam] - verkopen[b.naam]);
  const totaal = gesorteerd.length;

  return dranken.map(d => {
    if (d.minPrijs === d.maxPrijs) return { ...d }; // vaste prijs

    const idx = gesorteerd.findIndex(g => g.naam === d.naam);
    if (idx === -1) return { ...d };

    const normIdx      = idx / (totaal - 1 || 1);
    const extremeFactor = Math.abs(Math.cos(normIdx * Math.PI));
    const maxVariatie   = (d.maxPrijs - d.minPrijs) * FACTOR;
    let nieuwePrijs     = d.huidigePrijs;

    if (idx < totaal / 2) {
      nieuwePrijs = Math.max(d.huidigePrijs - maxVariatie * extremeFactor, d.minPrijs);
    } else {
      nieuwePrijs = Math.min(d.huidigePrijs + maxVariatie * extremeFactor, d.maxPrijs);
    }

    return { ...d, huidigePrijs: parseFloat(nieuwePrijs.toFixed(2)) };
  });
}

// --- Simulatie uitvoeren ---
function simuleer(runNr) {
  let dranken = kloon(configItems);
  const geschiedenis = []; // per cyclus: { cyclus, naam, prijs }
  const waarschuwingen = [];

  for (let cyclus = 1; cyclus <= CYCLI; cyclus++) {
    const verkopen = simuleerAankopen(dranken, AANKOPEN);
    dranken = berekeningNieuwePrijzen(dranken, verkopen);

    dranken.forEach(d => {
      geschiedenis.push({ cyclus, naam: d.naam, prijs: d.huidigePrijs });

      if (d.minPrijs < d.maxPrijs) {
        if (d.huidigePrijs <= d.minPrijs)
          waarschuwingen.push(`Cyclus ${cyclus}: ${d.naam} zit op MINIMUM (€${d.minPrijs})`);
        if (d.huidigePrijs >= d.maxPrijs)
          waarschuwingen.push(`Cyclus ${cyclus}: ${d.naam} zit op MAXIMUM (€${d.maxPrijs})`);
      }
    });
  }

  return { dranken, geschiedenis, waarschuwingen };
}

// --- Rapport afdrukken ---
function printRapport(runNr, dranken, geschiedenis, waarschuwingen) {
  const lijn = "─".repeat(72);
  console.log(`\n${"═".repeat(72)}`);
  console.log(` RUN ${runNr} — ${CYCLI} rondes × ~${AANKOPEN} aankopen  |  factor=${FACTOR}`);
  console.log(`${"═".repeat(72)}`);

  // Eindprijzen + prijsrange visualisatie
  console.log("\n EINDPRIJZEN:\n");
  console.log(` ${"Drank".padEnd(20)} ${"Min".padStart(5)} ${"Prijs".padStart(7)} ${"Max".padStart(5)}  Positie`);
  console.log(` ${lijn}`);

  dranken.forEach(d => {
    if (d.minPrijs === d.maxPrijs) {
      console.log(` ${d.naam.padEnd(20)} ${"".padStart(5)} ${"€" + d.huidigePrijs.toFixed(2).padStart(6)} ${"".padStart(5)}  (vast)`);
      return;
    }
    const range   = d.maxPrijs - d.minPrijs;
    const pos     = (d.huidigePrijs - d.minPrijs) / range; // 0–1
    const barLen  = 20;
    const filled  = Math.round(pos * barLen);
    const bar     = "[" + "█".repeat(filled) + "░".repeat(barLen - filled) + "]";
    const pct     = (pos * 100).toFixed(0).padStart(3) + "%";
    console.log(` ${d.naam.padEnd(20)} €${d.minPrijs.toFixed(2).padStart(4)} €${d.huidigePrijs.toFixed(2).padStart(5)} €${d.maxPrijs.toFixed(2).padStart(4)}  ${bar} ${pct}`);
  });

  // Prijsverloop per drank (elke 5 cycli)
  console.log("\n PRIJSVERLOOP (elke 5 rondes):\n");
  const namen = dranken.filter(d => d.minPrijs < d.maxPrijs).map(d => d.naam);
  const stapGrootte = Math.max(1, Math.floor(CYCLI / 8));
  const checkpunten = [];
  for (let c = 1; c <= CYCLI; c += stapGrootte) checkpunten.push(c);
  if (checkpunten[checkpunten.length - 1] !== CYCLI) checkpunten.push(CYCLI);

  const header = " Ronde  " + namen.map(n => n.substring(0, 10).padStart(11)).join("");
  console.log(header);
  console.log(" " + "─".repeat(header.length - 1));

  checkpunten.forEach(c => {
    const row = namen.map(naam => {
      const entry = geschiedenis.find(g => g.cyclus === c && g.naam === naam);
      return entry ? ("€" + entry.prijs.toFixed(2)).padStart(11) : "     -".padStart(11);
    });
    console.log(` ${String(c).padStart(5)}  ${row.join("")}`);
  });

  // Statistieken
  console.log("\n STATISTIEKEN:\n");
  namen.forEach(naam => {
    const prijzen = geschiedenis.filter(g => g.naam === naam).map(g => g.prijs);
    const min  = Math.min(...prijzen).toFixed(2);
    const max  = Math.max(...prijzen).toFixed(2);
    const gem  = (prijzen.reduce((s, p) => s + p, 0) / prijzen.length).toFixed(2);
    const d    = dranken.find(d => d.naam === naam);
    const vastgelopen =
      parseFloat(min) <= d.minPrijs + 0.01 && parseFloat(max) <= d.minPrijs + 0.01
        ? " ⚠️  VASTGELOPEN OP MIN"
        : parseFloat(min) >= d.maxPrijs - 0.01 && parseFloat(max) >= d.maxPrijs - 0.01
        ? " ⚠️  VASTGELOPEN OP MAX"
        : "";
    console.log(` ${naam.padEnd(20)}  min €${min}  gem €${gem}  max €${max}${vastgelopen}`);
  });

  // Waarschuwingen
  if (waarschuwingen.length > 0) {
    console.log(`\n WAARSCHUWINGEN (${waarschuwingen.length}):\n`);
    // Toon max 10, anders wordt het te lang
    waarschuwingen.slice(0, 10).forEach(w => console.log(`  ⚠️  ${w}`));
    if (waarschuwingen.length > 10)
      console.log(`  ... en nog ${waarschuwingen.length - 10} andere`);
  } else {
    console.log("\n ✅ Geen waarschuwingen — geen drank zat vast op min of max");
  }
}

// --- Vergelijking over runs ---
function printVergelijking(resultaten) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(` VERGELIJKING OVER ${RUNS} RUNS`);
  console.log(`${"═".repeat(72)}\n`);

  const namen = configItems.filter(d => d.minPrijs < d.maxPrijs).map(d => d.naam);

  console.log(` ${"Drank".padEnd(20)}` + Array.from({ length: RUNS }, (_, i) => `  Run ${i + 1}`.padStart(9)).join("") + "   Spread");
  console.log(" " + "─".repeat(20 + RUNS * 9 + 10));

  namen.forEach(naam => {
    const eindprijzen = resultaten.map(r => r.dranken.find(d => d.naam === naam)?.huidigePrijs ?? 0);
    const spread = (Math.max(...eindprijzen) - Math.min(...eindprijzen)).toFixed(2);
    const rij = eindprijzen.map(p => ("€" + p.toFixed(2)).padStart(9)).join("");
    const spreadLabel = parseFloat(spread) < 0.5 ? `  €${spread} ✅` : `  €${spread} ⚠️`;
    console.log(` ${naam.padEnd(20)}${rij}${spreadLabel}`);
  });

  const totaalWaarsch = resultaten.reduce((s, r) => s + r.waarschuwingen.length, 0);
  console.log(`\n Totaal waarschuwingen over alle runs: ${totaalWaarsch}`);
  if (totaalWaarsch === 0) {
    console.log(" ✅ Algoritme ziet er gezond uit — prijzen schommelen zonder vast te lopen.");
  } else {
    console.log(" ⚠️  Er zijn waarschuwingen — controleer of de factor niet te hoog is.");
  }
  console.log();
}

// --- Hoofdprogramma ---
console.log(`\nBar-Beurs Simulator  |  ${RUNS} run(s) × ${CYCLI} cycli × ~${AANKOPEN} aankopen/cyclus  |  factor=${FACTOR}`);

const resultaten = [];
for (let i = 1; i <= RUNS; i++) {
  const { dranken, geschiedenis, waarschuwingen } = simuleer(i);
  resultaten.push({ dranken, geschiedenis, waarschuwingen });
  printRapport(i, dranken, geschiedenis, waarschuwingen);
}

if (RUNS > 1) printVergelijking(resultaten);
