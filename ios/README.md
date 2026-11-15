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
4. Release builds read `Config/Release.xcconfig`, which already points at
   production and never sets `DEV_LOGIN_EMAIL`. See "Release" below.

## Release (TestFlight)

One command, from a clean checkout:

```bash
ios/scripts/release-ios.sh
```

It checks the Mac is set up, fetches the provisioning profile, picks the next
build number (one more than the higher of `project.yml` and App Store Connect),
archives, checks the archive (production URLs, no dev sign-in, privacy
manifest, Sign in with Apple), uploads, then commits the new build number in
`ios/project.yml`. Add `--wait` to wait for Apple's processing, or
`--no-commit` to leave the bump uncommitted.

Apple takes 5 to 15 minutes to process a build. Everyone in the **Internal**
TestFlight group gets each build automatically.

### What it needs on the Mac (one-time)

- Xcode 26 or later, and `brew install xcodegen`.
- The "Apple Distribution: Timothy Cheung (L3TR2JRJK9)" certificate in the
  login keychain.
- The App Store Connect API key shared with Routine:
  `~/.appstoreconnect/private_keys/AuthKey_<id>.p8`, with its two ids in
  `~/.appstoreconnect/release.env` (`ASC_KEY_ID=`, `ASC_ISSUER_ID=`, chmod 600).
  Never commit or print these.
- `pip3 install 'pyjwt[crypto]'` (the script reads App Store Connect with it).

### What is set up on Apple's side

| Thing | Value |
|---|---|
| Bundle id | `com.timofeic.gym`, with Sign in with Apple (primary App ID) |
| Provisioning profile | "Gym App Store" (App Store, Apple Distribution cert, expires Sep 2027) |
| App record | **Gym Coach** ("Gym" was taken), SKU `gym-ios`, English (Australia) |
| TestFlight group | **Internal**: internal, all builds, feedback on |

The home screen name is still "Gym" (`CFBundleDisplayName`). The store name
only shows in TestFlight and the App Store.

The API key has the App Manager role. That can upload and manage TestFlight,
but **cannot** create bundle ids or profiles (Apple returns 403), so those are
done in the [developer portal](https://developer.apple.com/account/resources).
If the distribution certificate is renewed, regenerate the "Gym App Store"
profile there; the script downloads it.

### Signing and config

- Release uses manual signing (`project.yml`, `ExportOptions.plist`), like
  Routine. Automatic signing would need cloud signing and an Admin key.
- Debug builds are unchanged: they read `Config/App.xcconfig` plus your
  `Local.xcconfig`, and need no team for the simulator.
- `ITSAppUsesNonExemptEncryption` is `NO`: the app only uses standard HTTPS
  and WebRTC encryption from the OS and LiveKit, which is exempt.
- `Gym/Resources/PrivacyInfo.xcprivacy` declares what the app collects (email,
  name, user id, workouts, voice audio), all linked to the account, used only
  for app features, no tracking. Keep the App Privacy answers in App Store
  Connect in line with it.
- To change the version, edit `MARKETING_VERSION` in `project.yml`.

### Not done yet

- Google sign-in on iPhone needs an iOS OAuth client for `com.timofeic.gym`;
  until its ids are in `Release.xcconfig`, the Google button is hidden.
- The sign-in service routes (`/api/native/*`) must be deployed to the
  production Vercel URL in `Release.xcconfig` before TestFlight builds can sign
  in.
