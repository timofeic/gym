-- Gym connector: OAuth for Claude and ChatGPT (see docs/connector.md).
--
-- Only the server (service role) touches these tables. Row level security is on
-- with no policies, so the anon and authenticated roles see nothing. Tokens and
-- codes are stored as SHA-256 hashes, never in plain text.

create table if not exists public.oauth_clients (
  id text primary key,                      -- client_id: random for DCR, a URL for CIMD
  client_name text not null,
  redirect_uris text[] not null,
  kind text not null check (kind in ('dcr', 'cimd')),
  client_secret_hash text,                  -- only for DCR clients that asked for a secret
  created_at timestamptz not null default now()
);

-- One row per app a person has connected. Revoking sets revoked_at.
create table if not exists public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references next_auth.users(id) on delete cascade,
  client_id text not null,
  client_name text not null,
  scope text not null default 'gym',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists idx_oauth_connections_user on public.oauth_connections(user_id);

create table if not exists public.oauth_codes (
  code_hash text primary key,
  client_id text not null,
  user_id uuid not null references next_auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  resource text not null,
  timezone text not null default 'UTC',
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.oauth_tokens (
  token_hash text primary key,
  kind text not null check (kind in ('access', 'refresh')),
  connection_id uuid not null references public.oauth_connections(id) on delete cascade,
  resource text not null,
  expires_at timestamptz not null,
  used_at timestamptz,                      -- refresh tokens are single use (rotated)
  created_at timestamptz not null default now()
);
create index if not exists idx_oauth_tokens_connection on public.oauth_tokens(connection_id);

alter table public.oauth_clients enable row level security;
alter table public.oauth_connections enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_tokens enable row level security;

revoke all on public.oauth_clients, public.oauth_connections, public.oauth_codes, public.oauth_tokens
  from anon, authenticated;
grant all on public.oauth_clients, public.oauth_connections, public.oauth_codes, public.oauth_tokens
  to service_role;
