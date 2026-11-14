# Gym for iPhone

SwiftUI app. Same data as the web app (Supabase), plus a voice coach over
LiveKit. How the parts fit: [../docs/native-architecture.md](../docs/native-architecture.md).

## Screens

- **Home**: workouts this week, sets per muscle, recent workouts (tap to edit,
  swipe to repeat or delete), "Log workout".
- **Progress**: weight and reps over time per exercise, with search and
  category filters.
- **Exercises**: your library. Edit a built-in to make your own copy; swipe to
  reset it.
- **Coach**: talk to the voice coach. It logs workouts, answers questions,
  suggests weights and runs rest timers. Screens refresh when it saves.
- **Settings** (person icon): categories, sign out.

## Run it locally (no Google, no LiveKit needed)

```bash
cd gym-app && scripts/localdb/localdb.sh start
```

```bash
cd gym-app && PORT=3030 scripts/dev-native.sh
```

```bash
cp ios/Config/Local.example.xcconfig ios/Config/Local.xcconfig
```

Put the `ANON_KEY` from `gym-app/.localdb/env` into `Local.xcconfig`, keep
`DEV_LOGIN_EMAIL = lifter@example.test`, then:

```bash
cd ios && xcodegen generate && open Gym.xcodeproj
```

Run on a simulator and tap **Dev sign-in**.

The local database is a Docker-free stand-in for Supabase (Homebrew
`postgresql` + `postgrest`). `npx supabase start` works too if Docker can
pull images.

## Tests

```bash
cd ios/Packages/GymCore && swift test
```

The UI tests drive the real app against the local database. Reset it first so
the seeded history is as expected:

```bash
cd gym-app && scripts/localdb/localdb.sh reset
```

```bash
cd ios && xcodebuild test -project Gym.xcodeproj -scheme Gym -destination 'platform=iOS Simulator,name=iPhone 17' -packageAuthorizationProvider netrc
```

`-packageAuthorizationProvider netrc` stops Xcode stalling on a hidden
Keychain prompt while it downloads LiveKit's prebuilt frameworks.

## Going live

1. **Google sign-in**: in Google Cloud console, create an **iOS** OAuth client
   for bundle id `com.timofeic.gym`. Put its id, the reversed id, and your
   existing web client id (`AUTH_GOOGLE_ID`) in `Local.xcconfig`. Add
   `GOOGLE_IOS_CLIENT_ID` to Vercel too.
2. **Sign-in service**: deploy `gym-app` as usual. New Vercel env vars:
   `GOOGLE_IOS_CLIENT_ID`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
   Never set `NATIVE_DEV_LOGIN` there.
3. **Voice agent**: see [../agent/README.md](../agent/README.md).
4. Point `GYM_SERVICE_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` in
   `Local.xcconfig` at production, clear `DEV_LOGIN_EMAIL`, and archive.
