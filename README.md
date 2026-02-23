# Gym Tracker

A mobile-first workout tracker built with Next.js, Supabase, and NextAuth.

## Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS + shadcn/ui
- Supabase (Postgres + auth adapter)
- NextAuth (Google sign-in)
- Vercel-ready deployment

## Repository Layout

```txt
.
├── gym-app/            # Next.js app
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── supabase/       # SQL migrations
└── README.md
```

## Prerequisites

- Node.js 20+
- npm
- Supabase project
- Google OAuth credentials (for sign-in)
- (Optional) Supabase CLI for migrations

## Environment Variables

Create `gym-app/.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_SECRET=
```

Notes:
- `NEXT_PUBLIC_*` values are safe for client use.
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side.
- `AUTH_SECRET` is required by NextAuth.

## Local Development

```bash
cd gym-app
npm install
npm run dev
```

Open http://localhost:3000

## Database Migrations

This project includes SQL migrations in `gym-app/supabase/migrations`.

Apply with Supabase CLI:

```bash
cd gym-app
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or apply manually in the Supabase SQL editor (see `gym-app/supabase/README.md`).

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Set **Root Directory** to `gym-app`.
4. Add all environment variables from above.
5. Deploy.

If you use Google auth, also add your Vercel URL to Google OAuth redirect URIs.

## Auth + Supabase Integration

- NextAuth handles login (Google).
- Supabase Adapter stores auth data in Supabase.
- Session callback issues a Supabase-compatible JWT for authenticated database access.

## Scripts

From `gym-app`:

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## License

Add your preferred license before making this public (e.g. MIT).