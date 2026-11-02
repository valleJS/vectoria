---
type: Runbook
description: Step-by-step deployment of vectoria to the Contabo VPS — Docker container behind the existing Nginx Proxy Manager, GitHub Actions deploys every push to main, rollback, backups, operations.
audience: human, agent
category: runbook
last_verified: 2026-11-02
load-when: Deploying, setting up or changing the production server, CI/CD, Docker image, backups, or production env config.
sources: [Dockerfile, .dockerignore, deploy/, .github/workflows/, apps/server/src/config.ts, apps/server/src/net/static.ts]
sources_stamp: 2ed5ab16b337b6f957ab19242237246e44160117
---

# Deployment (Contabo VPS, Docker, GitHub CI/CD)

Ziel: Jeder Push auf `main` wird geprüft, als Docker-Image gebaut und automatisch auf den Server
ausgerollt. Schlägt der Healthcheck fehl, wird automatisch zurückgerollt.

Platzhalter in allen Befehlen ersetzen:

| Platzhalter | Bedeutung |
| ----------- | --------- |
| `SERVER_IP` | IP des Contabo-VPS |
| `vectoria.DEINEDOMAIN.de` | Subdomain fürs Spiel |
| `PROXY_NETZ` | Docker-Netzwerk des Nginx Proxy Managers (Schritt 4) |

## Überblick

```
Browser ──443──▶ Nginx Proxy Manager (Container proxy-npm-1, Let's Encrypt)
                   └─▶ http://vectoria:3001  (Container vectoria, gleiches Docker-Netz)
                         ├─ /ws, /api/*, /healthz  → Spielserver
                         └─ alles andere           → gebauter Client (CLIENT_DIR)
Spielstand: /opt/vectoria/data/game.json (Volume) + Backups in /opt/vectoria/backups
```

**Warum der Contabo:** Gemessen am 2026-11-02 hatte er 6,8 GB RAM frei, 95 % CPU idle und 130 GB
freie Platte. Vectoria braucht bei 5–20 Spielern etwa 150–250 MB RAM und kaum CPU.

**Ein Container:** Der Spielserver liefert den Client selbst aus (`CLIENT_DIR`,
`apps/server/src/net/static.ts`). Dadurch braucht es nur einen Proxy-Host im NPM. Postgres und
Redis werden nicht gebraucht, der Spielstand ist eine JSON-Datei.

**Traffic:** WebSocket-Kompression ist an (`perMessageDeflate`). Ein State-Paket bei 20 Spielern
schrumpft damit von ~65 KB auf ~6 KB, 5× pro Sekunde pro verbundenem Spieler.

**Was zum Ablauf gehört:**

| Datei | Zweck |
| ----- | ----- |
| `Dockerfile` | Image bauen: Server + Client, läuft als User `node`, Healthcheck auf `/healthz` |
| `deploy/compose.yml` | Compose-Datei auf dem Server (`/opt/vectoria/compose.yml`) |
| `deploy/deploy.sh` | Rollout eines Image-Tags mit Backup, Healthcheck und Rollback |
| `deploy/vectoria.env.example` | Vorlage für die Spiel-Konfiguration auf dem Server |
| `.github/workflows/ci.yml` | PRs: format, lint, types, build |
| `.github/workflows/deploy.yml` | `main`: check → Image nach GHCR → SSH-Rollout |

## 1. DNS

Beim Domain-Anbieter einen A-Record anlegen:

```
vectoria.DEINEDOMAIN.de   A   SERVER_IP
```

Prüfen (lokal):

```bash
dig +short vectoria.DEINEDOMAIN.de   # muss SERVER_IP ausgeben
```

## 2. E-Mail (SMTP) besorgen

Der Login läuft über Codes per E-Mail, in Produktion ist SMTP Pflicht. Infrage kommen das Postfach
deines Mail-Hosters, Brevo, Mailjet o. ä. Notieren: Host, Port (587 = STARTTLS, 465 = TLS), User,
Passwort, Absender. Für die Absender-Domain SPF und DKIM einrichten, sonst landen die Codes im Spam.

## 3. Server vorbereiten

Als root auf den Server:

```bash
ssh root@SERVER_IP
```

Deploy-User anlegen. Er darf Docker bedienen, aber per SSH später nur `deploy.sh` ausführen:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /opt/vectoria/data /opt/vectoria/backups
chown -R deploy:deploy /opt/vectoria
chown 1000:1000 /opt/vectoria/data      # der Container läuft als uid 1000 (node)
```

Dateien aus dem Repo hochladen (lokal im Repo-Ordner ausführen):

```bash
scp deploy/compose.yml deploy/deploy.sh deploy/vectoria.env.example root@SERVER_IP:/opt/vectoria/
```

Wieder auf dem Server:

```bash
cd /opt/vectoria
mv vectoria.env.example vectoria.env
chmod 600 vectoria.env
chmod 755 deploy.sh
chown deploy:deploy compose.yml deploy.sh vectoria.env
```

Admin-Token erzeugen und `vectoria.env` ausfüllen (Domain, SMTP, Token):

```bash
openssl rand -base64 32        # Ausgabe als ADMIN_TOKEN eintragen
nano /opt/vectoria/vectoria.env
```

## 4. Netzwerk des Nginx Proxy Managers ermitteln

```bash
docker inspect proxy-npm-1 -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}'
```

Die Ausgabe (meist `proxy_default`) ist `PROXY_NETZ`. Dann die Compose-Variablen anlegen:

```bash
cat > /opt/vectoria/.env <<'EOF'
IMAGE_TAG=latest
PROXY_NETWORK=PROXY_NETZ
EOF
chown deploy:deploy /opt/vectoria/.env
```

## 5. Zugriff auf das Image (GHCR)

Das Image landet in der GitHub Container Registry unter `ghcr.io/vallejs/vectoria`. Ist das Repo
privat, ist auch das Image privat, und der Server muss sich einloggen.

1. Auf GitHub: *Settings → Developer settings → Personal access tokens → Tokens (classic)*,
   neuer Token nur mit Scope **`read:packages`**, Ablauf z. B. 1 Jahr.
2. Auf dem Server als `deploy` einloggen:

```bash
su - deploy
echo 'TOKEN_HIER' | docker login ghcr.io -u valleJS --password-stdin
exit
```

Ist das Repo öffentlich, entfällt der Schritt.

## 6. Deploy-Schlüssel für GitHub Actions

Lokal einen eigenen Schlüssel nur für Deploys erzeugen (ohne Passphrase):

```bash
ssh-keygen -t ed25519 -N "" -C github-deploy-vectoria -f ~/.ssh/vectoria_deploy
cat ~/.ssh/vectoria_deploy.pub
```

Den Public Key beim User `deploy` so eintragen, dass er **nur** `deploy.sh` starten kann. Der
mitgeschickte Befehl ist der Image-Tag, siehe `SSH_ORIGINAL_COMMAND` in `deploy.sh`.

Lokal ausführen. Der Befehl setzt die Optionen vor deinen Public Key und hängt die fertige Zeile
auf dem Server an; nichts abtippen:

```bash
{ printf 'command="/opt/vectoria/deploy.sh",restrict '; cat ~/.ssh/vectoria_deploy.pub; } \
  | ssh root@SERVER_IP 'install -d -m 700 -o deploy -g deploy /home/deploy/.ssh \
      && cat >> /home/deploy/.ssh/authorized_keys \
      && chown deploy:deploy /home/deploy/.ssh/authorized_keys \
      && chmod 600 /home/deploy/.ssh/authorized_keys'
```

Kontrolle:

```bash
ssh root@SERVER_IP 'tail -1 /home/deploy/.ssh/authorized_keys'
```

Das muss **eine** Zeile sein, in diesem Aufbau:

```
command="/opt/vectoria/deploy.sh",restrict ssh-ed25519 AAAAC3Nza…lang… github-deploy-vectoria
```

`restrict` sperrt Shell-Terminal, Port- und Agent-Forwarding. Wichtig: Der **private** Schlüssel
(`~/.ssh/vectoria_deploy`, ohne `.pub`) kommt nie auf den Server, sondern nur als GitHub-Secret
(Schritt 7).

Testen (lokal). Erwartet wird die Usage-Meldung von `deploy.sh`, also Exit-Code 2:

```bash
ssh -i ~/.ssh/vectoria_deploy deploy@SERVER_IP "kaputt"
```

## 7. GitHub einrichten (lokal, mit `gh`)

Environment und Secrets:

```bash
gh api -X PUT repos/valleJS/vectoria/environments/production
gh secret set DEPLOY_HOST --env production --body "SERVER_IP"
gh secret set DEPLOY_SSH_KEY --env production < ~/.ssh/vectoria_deploy
ssh-keyscan -t ed25519 SERVER_IP | gh secret set DEPLOY_KNOWN_HOSTS --env production
```

`main` schützen: nur per PR, und der CI-Check (Job `check`) muss grün sein.

```bash
gh api -X PUT repos/valleJS/vectoria/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": ["check"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
EOF
```

Bei privaten Repos braucht Branch Protection GitHub Pro. Ohne Pro einfach diszipliniert nur über
PRs mergen. Der Deploy-Workflow prüft vor dem Rollout ohnehin noch einmal.

## 8. Erster Deploy

Den PR mit `Dockerfile`, `deploy/` und den Workflows nach `main` mergen. Das startet den
Workflow **Deploy**. Alternativ manuell:

```bash
gh workflow run deploy.yml --ref main
gh run watch
```

Auf dem Server prüfen:

```bash
docker ps --filter name=vectoria                 # STATUS: Up … (healthy)
docker logs --tail 30 vectoria
docker exec vectoria wget -qO- http://127.0.0.1:3001/healthz
```

## 9. Proxy Host im Nginx Proxy Manager

Die NPM-Oberfläche lauscht nur auf `127.0.0.1:81`, deshalb per SSH-Tunnel öffnen (lokal):

```bash
ssh -L 8181:127.0.0.1:81 root@SERVER_IP
# Browser: http://localhost:8181
```

*Hosts → Proxy Hosts → Add Proxy Host*:

| Feld | Wert |
| ---- | ---- |
| Domain Names | `vectoria.DEINEDOMAIN.de` |
| Scheme / Forward Hostname / Port | `http` / `vectoria` / `3001` |
| Websockets Support | **an** (sonst kein Spiel) |
| Block Common Exploits | an |
| SSL-Tab | *Request a new SSL Certificate*, **Force SSL**, **HTTP/2** an |

## 10. Abnahme

```bash
curl -s https://vectoria.DEINEDOMAIN.de/healthz          # {"status":"ok",…}
curl -sI https://vectoria.DEINEDOMAIN.de/ | head -3       # HTTP/2 200
```

Im Browser:
1. Seite öffnen und mit einer echten E-Mail anmelden; der Code muss ankommen.
2. In den DevTools unter *Network → WS* muss `/ws` mit Status 101 offen sein.
3. Admin-Panel: `https://vectoria.DEINEDOMAIN.de/?admin` mit dem `ADMIN_TOKEN`.

Ab jetzt geht jeder Merge auf `main` automatisch live. Ein Deploy unterbricht das Spiel für ein
paar Sekunden: Der Server speichert beim Stoppen, die Clients verbinden sich selbst neu. Ändert
sich die Protokollversion, laden offene Tabs einmal neu.

## 11. Backups

Vor jedem Deploy kopiert `deploy.sh` den Spielstand nach `backups/` und behält 14 Tage. Dazu
kommt ein tägliches Backup (als root):

```bash
crontab -u deploy -e
# Zeile einfügen:
30 3 * * * cp /opt/vectoria/data/game.json /opt/vectoria/backups/game-daily-$(date +\%F).json 2>/dev/null
```

Offsite-Kopie: `/opt/vectoria/backups` in ein bestehendes Backup aufnehmen oder per `rclone` /
`scp` regelmäßig wegkopieren.

## 12. Betrieb

| Aufgabe | Befehl (auf dem Server, in `/opt/vectoria`) |
| ------- | ------------------------------------------- |
| Status | `docker ps --filter name=vectoria` |
| Logs live | `docker logs -f --tail 100 vectoria` |
| Neustart | `docker compose restart vectoria` |
| Laufende Version | `grep IMAGE_TAG .env` |
| Bestimmte Version ausrollen / zurückrollen | `su - deploy -c "/opt/vectoria/deploy.sh <git-sha>"` |
| Konfiguration ändern | `nano vectoria.env && docker compose up -d --force-recreate` |
| Spielstand wiederherstellen | `docker compose stop vectoria && cp backups/<datei>.json data/game.json && chown 1000:1000 data/game.json && docker compose start vectoria` |
| Speicherverbrauch | `docker stats --no-stream vectoria` |

Für einen Rollback den SHA nehmen, z. B. aus `git log --oneline` oder der Actions-Übersicht.
**Achtung:** Hat die neue Version das Speicherformat migriert, kann die alte den Stand eventuell
nicht lesen. Dann zusätzlich das `…-before-<sha>.json`-Backup dieses Deploys zurückspielen.

### Neue Runde starten

1. Siegpunkt-Ziel prüfen (Standard 10, wird nur beim Start gelesen):
   `grep VICTORY vectoria.env`; nach einer Änderung `docker compose up -d --force-recreate`.
2. Admin-Panel `https://vectoria.DEINEDOMAIN.de/?admin` → **Zurücksetzen**. Der Spielstand wird
   gelöscht, Anmeldungen bleiben. Vorher wird nichts automatisch gesichert; bei Bedarf
   `cp data/game.json backups/vor-reset-$(date +%F).json`.
3. Mitspielende anmelden lassen, dann **Anmeldung schließen & starten**. Die Karte wird jetzt
   neu und passend zur Spielerzahl erzeugt.

## 13. Fehlersuche

| Symptom | Ursache / Lösung |
| ------- | ---------------- |
| Workflow: `denied` beim Pull | GHCR-Login auf dem Server fehlt oder ist abgelaufen (Schritt 5) |
| Workflow: `Permission denied (publickey)` | Key oder `authorized_keys` falsch, Rechte prüfen (Schritt 6) |
| Container startet neu, Log: `ADMIN_TOKEN must be set` / `SMTP_HOST` | `vectoria.env` unvollständig |
| Log: `EACCES … /data/game.json` | `chown 1000:1000 /opt/vectoria/data` |
| `network … not found` | `PROXY_NETWORK` in `.env` stimmt nicht (Schritt 4) |
| NPM: 502 Bad Gateway | Container nicht im NPM-Netz oder nicht healthy: `docker network inspect PROXY_NETZ` |
| Seite lädt, Spiel verbindet nicht | Websockets Support im NPM aus, oder `ALLOWED_ORIGINS` ≠ echte Domain |
| Login-Code kommt nicht | SMTP-Daten, Spam-Ordner, SPF/DKIM; Fehler stehen im Container-Log |

## 14. Sicherheit auf diesem Server

- **Klartext-Passwort im WebDAV-Dienst:** Der rclone-WebDAV-Dienst bekommt sein Passwort per
  `--pass` auf der Kommandozeile. Damit sieht es jeder in der Prozessliste (`ps aux`). Passwort
  ändern und über eine htpasswd-Datei (`--htpasswd`) oder eine Umgebungsvariable übergeben.
- **Root-Login per SSH:** Nach dem Setup einen eigenen Admin-User mit sudo nutzen und in
  `/etc/ssh/sshd_config` `PermitRootLogin no` setzen. Der Deploy-Key kann ohnehin nur `deploy.sh`
  starten.
- **Docker-Gruppe:** Mitglieder der Docker-Gruppe sind faktisch root. Deshalb ist der Deploy-Key
  per `command=` auf das Skript beschränkt.
