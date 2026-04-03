# Bar-Beurs: Hoe werkt de app?

## Overzicht

**Bar-Beurs** is een interactief barsysteem waarbij drankprijzen automatisch fluctueren op basis van vraag — net als een aandelenbeurs. De app heet dan ook *"Wall Street On The Rocks!"*.

Het systeem bestaat uit **4 onderdelen**:

| Onderdeel | Map | Functie |
|---|---|---|
| Backend | `bar-management` | Server, database, prijslogica |
| Kassascherm | `bar-app` | Dranken selecteren en verkopen |
| Admin | `bar-admin` | Prijzen beheren, crash triggeren |
| Visueel scherm | `bar-visual` | Live grafiek en prijslijst voor gasten |

---

## Hoe werkt het prijsmechanisme?

Elke **15 minuten** berekent de server nieuwe prijzen op basis van de verkopen uit de afgelopen 15 minuten:

1. Alle beschikbare dranken worden gerangschikt van **minst verkocht → meest verkocht**.
2. De minst verkochte dranken **dalen in prijs** (richting hun minimumprijs).
3. De meest verkochte dranken **stijgen in prijs** (richting hun maximumprijs).
4. Hoe extremer de positie in de ranglijst, hoe groter de prijsverandering (via een cosinus-formule).
5. De `aanpassingsFactor` (standaard 20%) bepaalt hoe groot de maximale prijssprong kan zijn.

Elke **3 minuten** worden de huidige prijzen gelogd in de database voor de grafiek, zonder de officiële prijs al aan te passen.

Prijzen worden in **bonnen** weergegeven (1 bon = €0,50).

---

## Beurscrash

De admin kan op elk moment een **beurscrash** triggeren:

- **Crash actief**: alle dranken zakken direct naar hun **minimumprijs**.
- Het visuele scherm toont een grote rode melding: *"💥 BEURSCRASH 💥 — NU alle drank aan de laagste prijs"*.
- De grafiek verdwijnt tijdelijk.
- **Crash beëindigd**: alle prijzen herstellen naar het gemiddelde van min en max.

Tijdens een crash worden automatische prijsupdates geblokkeerd.

---

## De vier onderdelen in detail

### 1. `bar-management` — Backend (Node.js / Express)

- Draait op **poort 5000** (REST API) en **poort 5001** (WebSocket).
- Verbindt met een **PostgreSQL** database.
- Beheert alle dranken (`BarItem`), verkopen (`BarVerkoop`) en prijsgeschiedenis (`BarItemPrijs`).
- Stuurt via WebSocket real-time updates naar alle verbonden schermen.

**Belangrijke API-endpoints:**

| Method | Route | Functie |
|---|---|---|
| GET | `/api/baritems` | Haal alle dranken + huidige prijzen op |
| POST | `/api/barverkoop` | Registreer een nieuwe verkoop |
| GET | `/api/baritemprijs/history` | Haal prijsgeschiedens op voor grafiek |
| PATCH | `/api/baritems/:id/availability` | Zet drankje als uitverkocht/beschikbaar |
| GET | `/api/beursstatus` | Check of crash actief is |

---

### 2. `bar-app` — Kassascherm (React)

- Bedoeld voor de **barmedewerkers** achter de bar.
- Toont alle beschikbare dranken als knoppen met hun emoji en huidige prijs in bonnen.
- Barmedewerker klikt op dranken → winkelmandje wordt opgebouwd.
- Op "Verkoop registreren" wordt de bestelling naar de backend gestuurd en opgeslagen.
- Uitverkochte dranken zijn grijs en niet klikbaar.
- Ontvangt real-time prijsupdates via WebSocket (prijs in mandje past zich automatisch aan).

---

### 3. `bar-admin` — Adminpanel (React)

- Beveiligd met een login (gebruikersnaam: `123`, wachtwoord: `123`).
- Toont een tabel met alle dranken, hun huidige prijs en een invoerveld voor een nieuwe prijs.
- **Functies:**
  - **Prijzen handmatig aanpassen** per drankje.
  - **Willekeurige prijzen genereren** (random tussen min en max).
  - **Drankje markeren als uitverkocht** (of weer beschikbaar zetten).
  - **Beurscrash triggeren** via een rode knop — stuurt een WebSocket-bericht naar de server.

---

### 4. `bar-visual` — Groot scherm voor gasten (React)

- Bedoeld om **op een groot scherm** zichtbaar te zijn voor alle gasten.
- Toont een **live lijngrafiek** van de prijsgeschiedens van alle dranken.
- Elke drank heeft een vaste kleur in de grafiek (bijv. Pint = geel, Vodka cranberry = rood).
- Toont een **prijslijst** met alle huidige prijzen in bonnen.
- Bij een beurscrash: grafiek verdwijnt, grote rode melding verschijnt.
- Heeft een **dark mode** knop.
- Ontvangt alle updates real-time via WebSocket.

---

## Database tabellen (vereenvoudigd)

| Tabel | Inhoud |
|---|---|
| `BarItem` | Dranken met naam, emoji, min/max/huidigeprijs, beschikbaarheid |
| `BarVerkoop` | Elke geregistreerde verkoop met tijdstip en totaalprijs |
| `BarVerkoopItem` | Koppeling verkoop → drankje (aantal + verkoopprijs) |
| `BarItemPrijs` | Een set prijsopnames (met tijdstip) |
| `BarItemPrijsDetail` | Prijs per drankje per prijsopname |
| `BeursStatus` | Of de crash actief is (true/false) |

---

## Dranken en prijsranges

| Drank | Min | Max | Startprijs |
|---|---|---|---|
| Pint | €1,00 | €4,00 | €2,00 |
| Rouge | €1,00 | €4,00 | €2,50 |
| Mojito | €2,50 | €8,00 | €5,50 |
| Vodka sprite | €2,50 | €8,00 | €5,50 |
| Baco | €2,50 | €8,00 | €5,50 |
| Vodka cranberry | €2,50 | €8,00 | €5,50 |
| Wijn | €2,50 | €6,00 | €4,00 |
| Shot tequila | €2,00 | €4,00 | €3,00 |
| Frisdrank | €2,00 | €2,00 | €2,00 (vaste prijs) |
