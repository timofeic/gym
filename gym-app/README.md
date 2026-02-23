# Gym App (Next.js)

Mobile-first workout tracker built with Next.js, Supabase, and NextAuth.

## Tech Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS + shadcn/ui
- NextAuth (Google provider)
- Supabase (database + adapter)
- Vaul drawers for mobile UX

## Prerequisites

- Node.js 20+
- npm
- Supabase project
- Google OAuth credentials

## Environment Variables

Create `gym-app/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_SECRET=
```

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Database Migrations

Migrations are in `supabase/migrations`.

Apply with Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

See `supabase/README.md` for more details.

## Deploy (Vercel)

If this folder is part of a monorepo, set Vercel **Root Directory** to `gym-app`.

Then:
1. Import repo into Vercel.
2. Add all environment variables.
3. Deploy.

## Notes

- Authentication is required for app routes (middleware protected).
- Session callback issues a Supabase-compatible JWT for DB access.
- For Google auth in production, add your deployed URL to allowed redirect URIs.

## License

Add your preferred license before making this public (e.g. MIT).