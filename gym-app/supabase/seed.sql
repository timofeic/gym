-- Local test data. Only `supabase start` / `supabase db reset` load this.

insert into public.categories (name) values
  ('Chest'), ('Back'), ('Legs'), ('Shoulders'), ('Arms'), ('Core'),
  ('Upper'), ('Lower'), ('Push'), ('Pull')
on conflict (name) do nothing;

insert into public.exercises (id, name, sets, reps, weight, categories, is_default) values
  ('00000000-0000-0000-0000-0000000000a1', 'Bench Press',    3, 8,  60,  '{Chest,Upper,Push}', true),
  ('00000000-0000-0000-0000-0000000000a2', 'Back Squat',     5, 5,  80,  '{Legs,Lower}', true),
  ('00000000-0000-0000-0000-0000000000a3', 'Deadlift',       3, 5,  100, '{Back,Legs,Lower,Pull}', true),
  ('00000000-0000-0000-0000-0000000000a4', 'Overhead Press', 3, 8,  40,  '{Shoulders,Upper,Push}', true),
  ('00000000-0000-0000-0000-0000000000a5', 'Barbell Row',    3, 10, 50,  '{Back,Upper,Pull}', true),
  ('00000000-0000-0000-0000-0000000000a6', 'Bicep Curl',     3, 12, 12,  '{Arms,Pull}', true),
  ('00000000-0000-0000-0000-0000000000a7', 'Plank',          3, 1,  0,   '{Core}', true)
on conflict (id) do nothing;

-- Test user. The native app's dev sign-in uses this email locally.
insert into next_auth.users (id, name, email) values
  ('11111111-1111-1111-1111-111111111111', 'Test Lifter', 'lifter@example.test')
on conflict (id) do nothing;

-- Two past workouts so charts and history have something to show.
insert into public.workouts (id, user_id, date) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', now() - interval '8 days'),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.workout_exercises (workout_id, exercise_id, sets, reps, weight) values
  ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 3, 8, 57.5),
  ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 5, 5, 75),
  ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 3, 8, 60),
  ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a5', 3, 10, 50);
