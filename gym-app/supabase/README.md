# Supabase Migrations

This directory contains SQL migrations for the gym app database.

## Applying Migrations

### Option 1: Using Supabase CLI (Recommended)

1. Link your project (if not already linked):
   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```

2. Push the migration:
   ```bash
   npx supabase db push
   ```

### Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of the migration file from `migrations/20251122_tenant_aware_exercises.sql`
4. Paste and run the SQL in the editor

## Migration Files

- `20251122_tenant_aware_exercises.sql` - Makes exercises tenant-aware by adding user_id, parent_exercise_id, and is_default columns

