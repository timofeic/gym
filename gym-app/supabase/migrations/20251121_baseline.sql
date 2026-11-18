-- Baseline schema for the gym app.
--
-- The original tables were created by hand in the Supabase dashboard and never
-- checked in. This file rebuilds them from how the app uses each table, so a
-- fresh project (or `supabase start` locally) matches production.
-- Everything is IF NOT EXISTS, so running it against the live project is a no-op.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- next_auth schema (Auth.js Supabase adapter layout)
-- ---------------------------------------------------------------------------
create schema if not exists next_auth;
grant usage on schema next_auth to service_role;
grant all on schema next_auth to postgres;

create table if not exists next_auth.users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  "emailVerified" timestamptz,
  image text
);

create table if not exists next_auth.sessions (
  id uuid primary key default gen_random_uuid(),
  expires timestamptz not null,
  "sessionToken" text not null unique,
  "userId" uuid references next_auth.users(id) on delete cascade
);

create table if not exists next_auth.accounts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  provider text not null,
  "providerAccountId" text not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  oauth_token_secret text,
  oauth_token text,
  "userId" uuid references next_auth.users(id) on delete cascade,
  constraint provider_unique unique (provider, "providerAccountId")
);

create table if not exists next_auth.verification_tokens (
  identifier text,
  token text primary key,
  expires timestamptz not null,
  constraint token_identifier_unique unique (token, identifier)
);

grant all on all tables in schema next_auth to postgres, service_role;

-- ---------------------------------------------------------------------------
-- App tables
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Same rule as normalizeExerciseName(): trim, lower case, collapse spaces.
  normalized_name text generated always as
    (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  sets integer not null default 3,
  reps integer not null default 10,
  weight numeric not null default 0,
  categories text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_exercises_normalized_name on public.exercises(normalized_name);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references next_auth.users(id) on delete cascade,
  date timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_workouts_user_date on public.workouts(user_id, date desc);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  sets integer not null,
  reps integer not null,
  weight numeric not null default 0
);
create index if not exists idx_workout_exercises_workout on public.workout_exercises(workout_id);
create index if not exists idx_workout_exercises_exercise on public.workout_exercises(exercise_id);

-- ---------------------------------------------------------------------------
-- Row level security. auth.uid() is the `sub` claim of the signed JWT, which
-- is the next_auth.users id (see auth.ts and the native sign-in service).
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;

do $$ begin
  create policy "Signed-in users read categories" on public.categories
    for select to authenticated using (true);
  create policy "Signed-in users write categories" on public.categories
    for all to authenticated using (true) with check (true);

  create policy "Users manage own workouts" on public.workouts
    for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

  create policy "Users manage own workout exercises" on public.workout_exercises
    for all to authenticated
    using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()))
    with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));
exception when duplicate_object then null; end $$;

grant select, insert, update, delete on public.categories, public.exercises,
  public.workouts, public.workout_exercises to authenticated;
