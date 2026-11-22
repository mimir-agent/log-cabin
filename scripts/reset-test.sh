#!/usr/bin/env bash
# Empties every app table in a test database and seeds it again with the fake "Campfire Test" org.
#
#   scripts/reset-test.sh --env test   the campfire-test D1 database
#   scripts/reset-test.sh --local      the local database `wrangler dev --local` uses
#
# Any other remote database is refused before Cloudflare is contacted (scripts/seed-test.js checks).
set -euo pipefail

cd "$(dirname "$0")/.."
exec node scripts/seed-test.js --reset "$@"
