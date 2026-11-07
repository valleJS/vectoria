# Vectoria

A slow, browser-based 2D strategy game for a closed group of friends or colleagues. A round
runs for weeks and is played on the side during working hours, on a laptop or a phone.

Everyone starts with a castle. You gather wood, stone and gold, send troops across a generated
map to resource spots, chests, ruins and rival castles, and buy victory points. The first player
to reach the target (10 by default) wins.

Public instance: <https://vectoria.vgies.de>. The UI is in German.

## How a round works

- **Closed rounds:** Players sign up with their email address. When the admin closes
  registration, the server generates a map sized for the number of players and the round starts.
- **Game clock:** The game clock only runs during *gamedays*, by default Monday to Friday,
  10:00–18:00 in a configurable time zone. Marches, mining and income all follow this clock.
- **Economy:** You get resources every gameday and spend them on troops and victory points.
  Each victory point costs more than the one before.
- **Armies:** You can send troops to mine resources, pick up chests, take ruins (which become
  outposts) or attack castles. Marches take hours, and you can recall or redirect them on the way.
- **Combat:** Troop counts decide fights. Only troops at home defend, and the winner loots
  half of the loser's resources. Returning caravans can be raided on the way home.
- **Cards:** Chests contain special cards that hide information or speed up or strengthen
  an action.

You can open the in-game handbook before the round starts, and it explains every rule.
The source of truth for the rules is [`docs/AGENTS_GAME.md`](docs/AGENTS_GAME.md), and
the numbers are in [`packages/shared/src/rules.ts`](packages/shared/src/rules.ts).

## Quick start (local development)

Requirements: **Node.js ≥ 22.12** and npm. You don't need Docker, Postgres or Redis.

```bash
git clone https://github.com/valleJS/vectoria.git
cd vectoria
npm install
GAME_HOURS=always TIME_SCALE=60 npm run dev
```

`GAME_HOURS=always` keeps the clock running outside gameday hours. `TIME_SCALE=60` makes one game
hour pass in one real minute.

| URL | What |
| --- | ---- |
| <http://localhost:5173/> | Game (Vite dev server, hot reload) |
| <http://localhost:5173/?admin> | Admin panel. The token in development is `admin` |
| <http://localhost:3001/healthz> | Game server health check |

**Play a test round:**

1. Open the game in two or more browser profiles (or one normal and one private window) and sign
   up with different email addresses. Without SMTP configured, the **login codes are printed to
   the server log** in your terminal.
2. In the admin panel, click **„Anmeldung schließen & starten“** (close registration and start).
3. Play. With the settings above, one game hour passes in one real minute.

The game state is saved to `apps/server/data/game.json` every few seconds and survives restarts.
To start over, delete that file or use **„Zurücksetzen“** (reset) in the admin panel.

### Commands

| Task | Command |
| ---- | ------- |
| Dev server (game server :3001 + client :5173) | `npm run dev` |
| Format, lint and type check (run before committing) | `npm run check` |
| Auto-fix formatting / lint | `npm run format` / `npm run lint:fix` |
| Production build / run the built server | `npm run build` / `npm start` |

## Self-hosting

In production, one Node process does everything. It runs the game simulation, serves the
WebSocket (`/ws`) and HTTP API (`/api/*`), and serves the built client. Game state is a single
JSON file. You need:

- a small Linux server. 5–20 players use roughly 150–250 MB RAM and very little CPU,
- a domain with HTTPS in front of the game. The reverse proxy **must pass WebSockets**,
- an SMTP account to send login codes. In production the server refuses to start without one.
  Set up SPF/DKIM for the sender domain, otherwise the codes land in spam.

### Option A: Docker (recommended)

**1. Get the image.** Build it from source:

```bash
git clone https://github.com/valleJS/vectoria.git
cd vectoria
docker build -t vectoria .
```

or use the image that CI publishes for every commit on `main`: `ghcr.io/vallejs/vectoria:latest`.

**2. Configure it.** Copy the production template and fill it in:

```bash
cp deploy/vectoria.env.example vectoria.env
openssl rand -base64 32    # use as ADMIN_TOKEN
$EDITOR vectoria.env       # ADMIN_TOKEN, PUBLIC_URL, ALLOWED_ORIGINS, SMTP_*, SOURCE_URL
```

**3. Run it.** Keep `/data` on a volume, because that is where the game state lives:

```yaml
# compose.yml
services:
  vectoria:
    image: vectoria # or ghcr.io/vallejs/vectoria:latest
    restart: unless-stopped
    env_file: vectoria.env
    volumes:
      - vectoria-data:/data
    ports:
      - '127.0.0.1:3001:3001' # only reachable through the reverse proxy
    stop_grace_period: 20s # the server saves the game on SIGTERM

volumes:
  vectoria-data:
```

```bash
docker compose up -d
curl -s http://127.0.0.1:3001/healthz   # {"status":"ok",...}
```

If you bind-mount a host directory instead of a named volume, give it to uid 1000:
`chown 1000:1000 ./data`. The container runs as user `node`.

**4. Put HTTPS in front of it.** See [Reverse proxy](#reverse-proxy) below.

### Option B: Plain Node.js

```bash
git clone https://github.com/valleJS/vectoria.git /opt/vectoria
cd /opt/vectoria
npm ci
npm run build
cp apps/server/.env.example apps/server/.env
$EDITOR apps/server/.env   # see Configuration; at least ADMIN_TOKEN, SMTP_*, ALLOWED_ORIGINS
```

Then run the server with `NODE_ENV=production` and `CLIENT_DIR` pointing at the built client.
Here is an example systemd unit (`/etc/systemd/system/vectoria.service`):

```ini
[Unit]
Description=Vectoria game server
After=network-online.target

[Service]
User=vectoria
WorkingDirectory=/opt/vectoria/apps/server
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=CLIENT_DIR=/opt/vectoria/apps/client/dist
ExecStart=/usr/bin/node --enable-source-maps dist/index.js
Restart=on-failure
# The server saves the game on SIGTERM.
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

```bash
useradd --system --home /opt/vectoria vectoria
chown -R vectoria:vectoria /opt/vectoria
systemctl daemon-reload && systemctl enable --now vectoria
```

The server reads `apps/server/.env` from its working directory. The game state goes to
`apps/server/data/game.json` unless you set `DATA_FILE`.

To update: `git pull && npm ci && npm run build && systemctl restart vectoria`.

### Reverse proxy

Everything goes to `http://127.0.0.1:3001`. The only special requirement is WebSocket upgrades
on `/ws`.

**Caddy** (gets certificates automatically):

```caddyfile
play.example.com {
	reverse_proxy 127.0.0.1:3001
}
```

**nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name play.example.com;
    # ssl_certificate ... (e.g. via certbot)

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 1h;
    }
}
```

If you use **Nginx Proxy Manager**, add a proxy host to `vectoria:3001` and turn on
*Websockets Support*.

Once the proxy works, check the setup:

1. `https://play.example.com/healthz` returns `{"status":"ok",…}`.
2. Sign up with a real email address. The code arrives and the browser's network tab shows `/ws`
   with status 101.
3. `https://play.example.com/?admin` accepts your `ADMIN_TOKEN`.

### Running a round

1. Share the URL. Players sign up with their email and pick a name.
2. When everyone has joined, open `/?admin` and click **„Anmeldung schließen & starten“**. The
   server generates the map for that number of players.
3. To start a new round later, go to the admin panel and click **„Zurücksetzen“**. This clears the
   game but keeps sign-ups. Then start again. `VICTORY_POINTS_TO_WIN` is only read at server
   start, so restart after you change it.

### Backups

All state is in one JSON file (`/data/game.json` in Docker). Copy it regularly, for example with
a daily cron job:

```cron
30 3 * * * docker cp vectoria:/data/game.json /var/backups/vectoria/game-$(date +\%F).json
```

To restore a backup, stop the server, put the file back and start the server again.

### Continuous deployment

The public instance deploys every merge to `main` automatically. GitHub Actions builds the
image, pushes it to GHCR and rolls it out over SSH, with a health check and automatic rollback.
The full runbook, including server hardening and troubleshooting, is
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (German). It uses the files in [`deploy/`](deploy/)
and [`.github/workflows/`](.github/workflows/).

## Configuration

Set these as environment variables, or in `apps/server/.env` (template:
[`apps/server/.env.example`](apps/server/.env.example)). For Docker, use the `env_file`
(template: [`deploy/vectoria.env.example`](deploy/vectoria.env.example)).

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `ADMIN_TOKEN` | `admin` in dev | Admin panel access. **Required in production** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | unset, `587`, `false` | Mail server for login codes. **Required in production**. Use `SMTP_SECURE=true` for port 465 |
| `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | unset | Mail account. `MAIL_FROM` must be allowed by that account |
| `PUBLIC_URL` | request origin | Base URL for login links in emails |
| `ALLOWED_ORIGINS` | empty = any | Comma-separated allowed WebSocket origins. Set this in production |
| `SOURCE_URL` | this repository | Where the in-game "Quellcode" link points (see [License](#license)) |
| `GAME_HOURS` | `weekdays` | `weekdays` = Mon–Fri 10–18, `always` = the clock never stops |
| `GAME_TIMEZONE` | `Europe/Berlin` | Time zone for gameday hours |
| `TIME_SCALE` | `1` | Game clock speed multiplier, for testing |
| `VICTORY_POINTS_TO_WIN` | `10` | Win condition, read at server start |
| `TICK_RATE` | `5` | Simulation ticks per second |
| `MAP_SEED` | random | Fixed seed for map generation |
| `DATA_FILE` | `data/game.json` | Save file, relative to the server's working directory |
| `CLIENT_DIR` | unset | Built client to serve. If unset, the server serves only the API. The Docker image sets this |
| `HOST`, `PORT` | `0.0.0.0`, `3001` | Listen address |

When you run the client separately from the server, the client takes two build-time variables:
`VITE_WS_URL` and `VITE_API_URL`. By default it uses the same origin as the page.

## Project structure

This is an npm-workspaces monorepo in TypeScript:

```
apps/client      React 19, Vite, PixiJS 8, Tailwind 4, zustand: map renderer, HUD, admin panel
apps/server      Node + ws: authoritative simulation, game clock, HTTP API, JSON persistence
packages/shared  Network protocol, game types and balance constants used by both sides
docs/            Architecture, rules, decision records and runbooks (start at AGENTS.md)
deploy/          Production compose file, deploy script and env template
```

The server is authoritative. Clients only send intents over the WebSocket. The server validates
them, advances the world and sends each player a filtered view, because some cards hide
details from other players. See [`docs/AGENTS_ARCHITECTURE.md`](docs/AGENTS_ARCHITECTURE.md) for
details.

## Contributing

Issues and pull requests are welcome. Before you open a PR:

- run `npm run check` (Prettier, ESLint, TypeScript). CI runs the same check,
- put network message and game types only in `packages/shared`,
- update the matching file in `docs/` when you change behavior it describes. [`AGENTS.md`](AGENTS.md)
  and [`docs/_index.md`](docs/_index.md) show which file covers what.

By contributing, you agree that your contribution is licensed under the AGPL-3.0-or-later.

## License

Vectoria is free software under the
[GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`).

You may use, modify and host it, including commercially. If you **run a modified version** that
other people use over the network, you must offer those players the source code of your version
under the same license (AGPL §13). The game does this for you. The join screen and the handbook
link to `/source`, which redirects to `SOURCE_URL`. If you change the code, publish your fork
and point `SOURCE_URL` at it.
