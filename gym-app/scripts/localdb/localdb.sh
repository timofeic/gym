#!/usr/bin/env bash
# A Supabase-like database on this Mac, no Docker needed.
#   scripts/localdb/localdb.sh start   # build (first time) and run
#   scripts/localdb/localdb.sh reset   # wipe and rebuild from migrations + seed
#   scripts/localdb/localdb.sh stop
# Needs Homebrew postgresql and postgrest. Writes keys to .localdb/env.
set -euo pipefail
export LC_ALL=C

APP="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$APP/.localdb"
DATA="$DIR/data"
PG_PORT=54322 REST_PORT=54320 API_PORT=54321
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
PSQL=(psql -h 127.0.0.1 -p $PG_PORT -U postgres -v ON_ERROR_STOP=1 -q)

stop() {
  [ -f "$DIR/proxy.pid" ] && kill "$(cat "$DIR/proxy.pid")" 2>/dev/null || true
  [ -f "$DIR/postgrest.pid" ] && kill "$(cat "$DIR/postgrest.pid")" 2>/dev/null || true
  [ -d "$DATA" ] && pg_ctl -D "$DATA" -m fast stop >/dev/null 2>&1 || true
  rm -f "$DIR"/*.pid
}

build() {
  rm -rf "$DATA"; mkdir -p "$DIR"
  initdb -D "$DATA" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$DATA" -o "-p $PG_PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DIR/postgres.log" -w start >/dev/null
  "${PSQL[@]}" -d postgres -f "$APP/scripts/localdb/bootstrap.sql"
  for f in $(ls "$APP"/supabase/migrations/*.sql | sort); do "${PSQL[@]}" -d postgres -f "$f"; done
  "${PSQL[@]}" -d postgres -f "$APP/supabase/seed.sql"
}

start_servers() {
  pg_ctl -D "$DATA" status >/dev/null 2>&1 || \
    pg_ctl -D "$DATA" -o "-p $PG_PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DIR/postgres.log" -w start >/dev/null
  cat > "$DIR/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:$PG_PORT/postgres"
db-schemas = "public,next_auth"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $REST_PORT
EOF
  postgrest "$DIR/postgrest.conf" >"$DIR/postgrest.log" 2>&1 & echo $! >"$DIR/postgrest.pid"
  node "$APP/scripts/localdb/proxy.mjs" $API_PORT $REST_PORT >"$DIR/proxy.log" 2>&1 & echo $! >"$DIR/proxy.pid"

  # Same names `supabase status -o env` prints.
  node --input-type=module -e "
    import { SignJWT } from 'jose'
    const key = new TextEncoder().encode('$JWT_SECRET')
    const mk = role => new SignJWT({ role }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('supabase-demo').setIssuedAt().setExpirationTime('10y').sign(key)
    console.log('API_URL=\"http://127.0.0.1:$API_PORT\"')
    console.log('ANON_KEY=\"' + await mk('anon') + '\"')
    console.log('SERVICE_ROLE_KEY=\"' + await mk('service_role') + '\"')
    console.log('JWT_SECRET=\"$JWT_SECRET\"')
  " >"$DIR/env"

  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/rest/v1/" && { echo "Local database ready at http://127.0.0.1:$API_PORT (keys in .localdb/env)"; return; }
    sleep 0.25
  done
  echo "PostgREST did not start; see $DIR/postgrest.log" >&2; exit 1
}

cd "$APP"
case "${1:-start}" in
  start) [ -d "$DATA" ] || build; start_servers ;;
  reset) stop; build; start_servers ;;
  stop) stop ;;
  *) echo "usage: $0 start|reset|stop" >&2; exit 2 ;;
esac
