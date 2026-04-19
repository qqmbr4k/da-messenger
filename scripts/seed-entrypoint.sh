#!/bin/sh
set -e

SEEDED=$(psql -tAc "SELECT 1 FROM \"User\" WHERE username='seed_user_1' LIMIT 1" 2>/dev/null || echo "")

if [ -z "$SEEDED" ]; then
  echo "[seed] Seeding database — this takes a few minutes..."
  psql -f /seed.sql
  echo "[seed] Done."
else
  echo "[seed] Already seeded, skipping."
fi
