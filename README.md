# Vectoria

Ein Browser-Strategiespiel in 2D aus der Vogelperspektive. Es läuft über Wochen und wird an
Werktagen nebenbei gespielt, am Laptop oder am Handy. Nach dem Ende der Anmeldung ist die Runde
geschlossen: Alle Teilnehmenden starten mit einer Burg, sammeln Ressourcen, schicken Truppen über
die Karte und kaufen Siegpunkte. Wer zuerst **10 Siegpunkte** hat, gewinnt.

Live: <https://vectoria.vgies.de>

## Spielprinzip

- **Gamedays:** Montag–Freitag, 10–18 Uhr (Europe/Berlin). Nur in dieser Zeit läuft die Spieluhr,
  also auch Märsche und Abbau.
- **Ressourcen:** Holz, Stein und Gold. Zu Beginn jedes Gamedays bekommt jede:r von jeder
  Ressource 1. Für die gewählte **Basisaktivität** gibt es stattdessen 3. Eine neue Wahl gilt ab
  dem nächsten Gameday.
- **Kaufen:** 10 Truppen kosten 1 Holz + 1 Gold, der erste Siegpunkt kostet 1 Holz + 2 Stein + 1 Gold, jeder
  weitere 1 Ressource mehr (abwechselnd Stein, Holz, Gold) – der zehnte also 4 Holz + 5 Stein + 4 Gold.
- **Truppen schicken:** an Ressourcenvorkommen (100 Truppen bauen 10 Ressourcen pro Gameday ab), zu
  Truhen, Ruinen oder gegnerischen Burgen. Einmal quer über die Karte dauert es etwa 10
  Spielstunden. Unterwegs lassen sich Truppen jederzeit zurückrufen oder umleiten.
- **Kampf:** Verglichen werden nur die Truppenzahlen, und es verteidigen nur die Truppen, die
  gerade zu Hause sind. Wer siegt, plündert die Hälfte der Ressourcen.
- **Überfälle:** Heimkehrende Züge mit Ressourcen lassen sich unterwegs abfangen. Züge, die eine
  Truhe tragen, sind davor geschützt.
- **Ruinen & Stützpunkte:** Auf der Karte stehen leere Ruinen. Wer eine einnimmt, baut sie als
  „Stützpunkt <Name>“ wieder auf und verwaltet dort eigene Truppen und Ressourcen.
- **Truhen:** Jeden Gameday erscheint eine Truhe. Sie braucht eine zufällige Mindestzahl an
  Truppen; der erste Zug, der genug mitbringt, nimmt sie mit nach Hause. Geöffnet wird sie erst,
  wenn man online ist – mit Animation.
- **Spezialkarten aus Truhen:** Nebel (Truppenzahl verborgen), Tarnung (Ziel verborgen),
  Eilmarsch (halbe Marschzeit) und Bollwerk (+50 % Verteidigung). Eine Karte wird aktiviert und
  wirkt auf den nächsten Zug bzw. sofort. Sonst ist alles auf der Karte sichtbar.
- **Karte:** wird beim Start passend zur Spielerzahl erzeugt und ist immer eine zusammenhängende
  Landmasse.
- **Handbuch:** Im Spiel (Kompass unten links, am Handy das Buch oben rechts) stehen alle
  Mechaniken und ein Kartenkatalog. Schon auf dem Anmeldescreen und in der Lobby lässt es sich
  öffnen, damit sich alle vor dem Start einlesen können.

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

Ohne `GAME_HOURS=always` läuft die Uhr nur zu den echten Gameday-Zeiten. Login läuft per
E-Mail-Code; ohne `SMTP_HOST` stehen die Codes im Server-Log.

Die Oberfläche hat zwei Layouts: ab 900 px Breite Seitenleisten, darunter (Handy) eine
Tab-Leiste unten mit Ticker, Auswahl, Zügen, Rangliste und Reich.

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
| `VICTORY_POINTS_TO_WIN` | `10` | Siegpunkt-Ziel (wird beim Serverstart gelesen) |
| `DATA_FILE` | `data/game.json` | Spielstand, wird alle paar Sekunden gespeichert |
| `ALLOWED_ORIGINS` | leer = alle | erlaubte WebSocket-Origins, in Produktion setzen |
| `SMTP_*` / `MAIL_FROM` | leer = Codes im Log | Versand der Login-Codes; `MAIL_FROM` muss zum SMTP-Konto passen |
| `PUBLIC_URL` | Origin der Anfrage | Basis für Links in Login-Mails |

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

## Deployment

Jeder Merge auf `main` baut ein Docker-Image (GHCR) und deployt es per GitHub Actions auf den VPS
(hinter Nginx Proxy Manager, mit Health-Check und automatischem Rollback). Der Container liefert
Spiel und Client zusammen aus. Schritt-für-Schritt-Anleitung und Betrieb (Neustart, Backups,
neue Runde): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Neue Runde in Produktion: Adminpanel `https://vectoria.vgies.de/?admin` → **Zurücksetzen**
(Anmeldungen bleiben) → Mitspielende anmelden lassen → **Anmeldung schließen & starten**.
