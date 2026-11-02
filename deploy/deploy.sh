#!/usr/bin/env bash
# Rolls out one image tag; run by GitHub Actions over SSH (forced command) or by hand:
#   /opt/vectoria/deploy.sh <tag>
# Backs up the save, switches IMAGE_TAG, waits for the health check, rolls back on failure.
set -euo pipefail

TAG="${1:-${SSH_ORIGINAL_COMMAND:-}}"
if [[ ! "$TAG" =~ ^[0-9a-f]{7,40}$|^latest$ ]]; then
  echo "usage: deploy.sh <git-sha|latest>" >&2
  exit 2
fi

cd /opt/vectoria
PREV=$(grep -oP '^IMAGE_TAG=\K.*' .env || echo latest)

mkdir -p backups
[ -f data/game.json ] && cp data/game.json "backups/game-$(date +%F-%H%M%S)-before-$TAG.json"

set_tag() { sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env; }

echo "Deploying $TAG (was $PREV)"
set_tag "$TAG"
docker compose pull --quiet
docker compose up -d

for _ in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' vectoria 2>/dev/null || echo missing)
  if [ "$status" = healthy ]; then
    echo "Healthy."
    docker image prune -f >/dev/null
    find backups -name 'game-*.json' -mtime +14 -delete
    exit 0
  fi
  sleep 2
done

echo "Health check failed — rolling back to $PREV" >&2
docker compose logs --tail 50 vectoria >&2 || true
set_tag "$PREV"
docker compose up -d
exit 1
