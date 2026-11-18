#!/usr/bin/env bash
# Runs the Next.js app against the local database with dev sign-in on,
# for the iPhone simulator and UI tests. LiveKit keys come from .env.local
# if you've added them there.
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/localdb/localdb.sh start
set -a; . .localdb/env; set +a
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SUPABASE_JWT_SECRET="$JWT_SECRET"
export NATIVE_DEV_LOGIN=true AUTH_SECRET="${AUTH_SECRET:-local-dev-auth-secret}"
exec npx next dev -p "${PORT:-3000}"
