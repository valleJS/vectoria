# Vectoria

Ein Browser-Strategiespiel in 2D aus der Vogelperspektive. Es läuft über Wochen und wird an
Werktagen gespielt. Nach dem Ende der Anmeldung ist die Runde geschlossen: Alle Teilnehmenden
starten mit einer Burg, sammeln Ressourcen, schicken Truppen über die Karte und kaufen Siegpunkte.
Wer zuerst das Siegpunkt-Ziel erreicht, gewinnt.

## Spielprinzip

- **Gamedays:** Montag–Freitag, 10–18 Uhr (Europe/Berlin). Nur in dieser Zeit läuft die Spieluhr,
  also auch Märsche und Abbau.
- **Ressourcen:** Holz, Stein und Gold. Zu Beginn jedes Gamedays bekommt jede:r von jeder
  Ressource 1. Für die gewählte **Basisaktivität** gibt es stattdessen 3. Eine neue Wahl gilt ab
  dem nächsten Gameday.
- **Kaufen:** 10 Truppen kosten 1 Holz + 1 Gold, ein Siegpunkt kostet 1 Holz + 2 Stein + 1 Gold.
- **Truppen schicken:** an Ressourcenvorkommen (100 Truppen bauen 10 Ressourcen pro Gameday ab), zu
  Truhen oder zu gegnerischen Burgen. Einmal quer über die Karte dauert es etwa 10 Spielstunden.
  Unterwegs lassen sich Truppen jederzeit zurückrufen.
- **Kampf:** Verglichen werden nur die Truppenzahlen, und es verteidigen nur die Truppen, die
  gerade zu Hause sind. Wer siegt, plündert die Hälfte der Ressourcen.
- **Spezialkarten aus Truhen:** Nebel (Truppenzahl verborgen), Tarnung (Ziel verborgen),
  Eilmarsch (halbe Marschzeit) und Bollwerk (+50 % Verteidigung). Sonst ist alles auf der Karte
  sichtbar.

Alle Regeln stehen in [`docs/AGENTS_GAME.md`](docs/AGENTS_GAME.md), die Zahlen in
[`packages/shared/src/rules.ts`](packages/shared/src/rules.ts).

## Schnellstart

Voraussetzung: Node ≥ 22.12.

```bash
npm install
GAME_HOURS=always TIME_SCALE=60 npm run dev   # Uhr läuft immer, 1 Spielstunde = 1 Minute
```

- Spiel: <http://localhost:5173/>
- Adminpanel: <http://localhost:5173/?admin> (Token in der Entwicklung: `admin`)

Ablauf: In mehreren Browser-Profilen anmelden, dann im Adminpanel auf **„Anmeldung schließen &
starten“** klicken. Die Karte wird passend zur Zahl der Spieler:innen erzeugt.

Ohne `GAME_HOURS=always` läuft die Uhr nur zu den echten Gameday-Zeiten.

## Befehle

| Aufgabe | Befehl |
| ------- | ------ |
| Entwicklung (Server :3001 + Client :5173) | `npm run dev` |
| Format, Lint, Typen prüfen | `npm run check` |
| Produktions-Build / Server starten | `npm run build` / `npm start` |
| Postgres + Redis (optional, Docker) | `npm run services:up` |

## Konfiguration

Der Server liest `apps/server/.env`; als Vorlage dient [`.env.example`](apps/server/.env.example).
Die wichtigsten Variablen:

| Variable | Standard | Bedeutung |
| -------- | -------- | --------- |
| `ADMIN_TOKEN` | `admin` (nur Dev) | Zugang zum Adminpanel, **in Produktion Pflicht** |
| `GAME_HOURS` | `weekdays` | `weekdays` = Mo–Fr 10–18, `always` = Uhr läuft durchgehend |
| `GAME_TIMEZONE` | `Europe/Berlin` | Zeitzone für die Gamedays |
| `TIME_SCALE` | `1` | Faktor für die Spieluhr, zum Testen |
| `VICTORY_POINTS_TO_WIN` | `25` | Siegpunkt-Ziel |
| `DATA_FILE` | `data/game.json` | Spielstand, wird alle paar Sekunden gespeichert |
| `ALLOWED_ORIGINS` | leer = alle | erlaubte WebSocket-Origins, in Produktion setzen |

## Aufbau

npm-Workspaces-Monorepo:

```
apps/client      React 19 + Vite + PixiJS 8 + Tailwind 4 + zustand (Karte, HUD, Adminpanel)
apps/server      Node + ws: autoritative Simulation, Spieluhr, HTTP-API, JSON-Persistenz
packages/shared  Protokoll, Spieltypen und Balancing-Konstanten für beide Seiten
docs/            Doku für Agents: Codemaps, Regeln, ADRs (Einstieg: AGENTS.md)
```

Der Server ist autoritativ. Clients schicken nur Absichten über einen WebSocket (`/ws`); der
Server prüft sie und schickt jedem Client eine eigene Sicht auf die Welt, denn Spezialkarten
verbergen Details vor anderen. Details stehen in
[`docs/AGENTS_ARCHITECTURE.md`](docs/AGENTS_ARCHITECTURE.md).
