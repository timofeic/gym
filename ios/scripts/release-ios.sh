#!/usr/bin/env bash
#
# One command from a clean checkout to a build in TestFlight:
#
#   ios/scripts/release-ios.sh
#
# Generates the Xcode project, archives a Release build, uploads it with the
# App Store Connect API key, then commits the new build number in
# ios/project.yml so the next release starts from the right number.
#
# Needs, outside the repo (one-time per Mac):
#
#   1. Xcode 26+ and xcodegen (brew install xcodegen).
#   2. An "Apple Distribution: ... (L3TR2JRJK9)" certificate in the login
#      keychain. Xcode > Settings > Accounts > Manage Certificates.
#   3. An App Store Connect API key (role App Manager is enough). The .p8 goes
#      in ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 and the two ids
#      in ~/.appstoreconnect/release.env (chmod 600), shared with Routine:
#
#        ASC_KEY_ID=...
#        ASC_ISSUER_ID=...
#
#      Override the file with ASC_ENV_FILE=... The key is a credential: never
#      committed, never printed.
#   4. python3 with PyJWT (pip3 install 'pyjwt[crypto]'), used to read the
#      latest build number and fetch the provisioning profile.
#
# Apple-side setup already done (see ios/README.md, "Release"): bundle id
# com.timofeic.gym with Sign in with Apple, profile "Gym App Store", app
# record "Gym Coach", internal TestFlight group.
#
# Options:
#   --no-commit   upload but leave the build number change uncommitted
#   --wait        after upload, wait until App Store Connect finishes processing

set -euo pipefail

cd "$(dirname "$0")/.."           # ios/
IOS="$(pwd)"
ROOT="$(cd .. && pwd)"
BUNDLE_ID="com.timofeic.gym"
PROFILE="Gym App Store"
ARCHIVE="build/Gym.xcarchive"
COMMIT=1
WAIT=0
for arg in "$@"; do
  case "$arg" in
    --no-commit) COMMIT=0 ;;
    --wait) WAIT=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

fail() { printf '\nrelease-ios: %s\n' "$1" >&2; exit 1; }
step() { printf '\n==> %s\n' "$1"; }

# --- preflight -------------------------------------------------------------
# Fail here, where the message can explain itself, not 5 minutes into an archive.
step "Preflight"

command -v xcodegen >/dev/null || fail "xcodegen not found: brew install xcodegen"
XCODE_MAJOR=$(xcodebuild -version | awk 'NR==1{split($2,v,"."); print v[1]}')
[ "${XCODE_MAJOR:-0}" -ge 26 ] || fail "App Store uploads need Xcode 26 or later (found $(xcodebuild -version | head -1))"

ENV_FILE="${ASC_ENV_FILE:-$HOME/.appstoreconnect/release.env}"
[ -f "$ENV_FILE" ] || fail "no $ENV_FILE with ASC_KEY_ID and ASC_ISSUER_ID (see the top of this script)"
set -a; . "$ENV_FILE"; set +a
: "${ASC_KEY_ID:?ASC_KEY_ID missing from $ENV_FILE}"
: "${ASC_ISSUER_ID:?ASC_ISSUER_ID missing from $ENV_FILE}"
export ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
[ -f "$ASC_KEY_PATH" ] || fail "no API key at ~/.appstoreconnect/private_keys/AuthKey_<id>.p8"

python3 -c 'import jwt, cryptography' 2>/dev/null \
  || fail "python3 needs PyJWT: pip3 install 'pyjwt[crypto]'"
ASC() { python3 -I "$IOS/scripts/asc.py" "$@"; }

security find-identity -v -p codesigning 2>/dev/null | grep -q "Apple Distribution: .*(L3TR2JRJK9)" \
  || fail "no Apple Distribution certificate for team L3TR2JRJK9 in the keychain.
  Xcode > Settings > Accounts > Manage Certificates > + > Apple Distribution."

git -C "$ROOT" diff --quiet -- ios/project.yml \
  || fail "ios/project.yml has uncommitted changes; commit them first so the
  build number bump is the only change in the release commit."

grep -q '^DEV_LOGIN_EMAIL *= *$' Config/Release.xcconfig \
  || fail "DEV_LOGIN_EMAIL must be empty in Config/Release.xcconfig"

# The profile lives on Apple's side; fetch it so a fresh Mac needs no clicks.
ASC install-profile "$PROFILE" || fail "could not fetch the \"$PROFILE\" provisioning profile"

# --- build number ----------------------------------------------------------
# App Store Connect rejects a build number it has seen before, even one that
# failed processing. Take whichever is higher, git or Apple, and add one.
LOCAL=$(sed -n 's/^ *CURRENT_PROJECT_VERSION: *"\{0,1\}\([0-9]*\)"\{0,1\}$/\1/p' project.yml | head -1)
[ -n "$LOCAL" ] || fail "could not read CURRENT_PROJECT_VERSION from project.yml"
REMOTE=$(ASC latest-build "$BUNDLE_ID") || fail "could not read builds from App Store Connect"
NEXT=$(( (LOCAL > REMOTE ? LOCAL : REMOTE) + 1 ))
MARKETING=$(sed -n 's/^ *MARKETING_VERSION: *"\{0,1\}\([0-9.]*\)"\{0,1\}$/\1/p' project.yml | head -1)
step "Releasing $MARKETING ($NEXT): project.yml had $LOCAL, App Store Connect has $REMOTE"

# --- project ---------------------------------------------------------------
step "Generating Gym.xcodeproj"
xcodegen generate --quiet

# --- archive ---------------------------------------------------------------
# -packageAuthorizationProvider netrc: without it xcodebuild can stall on a
# hidden Keychain prompt while downloading LiveKit's binary frameworks.
step "Archiving (Release)"
rm -rf "$ARCHIVE" build/export
mkdir -p build
xcodebuild \
  -project Gym.xcodeproj \
  -scheme Gym \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -clonedSourcePackagesDirPath build/SourcePackages \
  -packageAuthorizationProvider netrc \
  CURRENT_PROJECT_VERSION="$NEXT" \
  archive -quiet

APP="$ARCHIVE/Products/Applications/Gym.app"
[ -d "$APP" ] || fail "archive reported success but has no Gym.app"

# --- check what is inside before spending a build number ---------------------
step "Checking the archive"
plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$APP/Info.plist" 2>/dev/null || true; }
[ "$(plist CFBundleVersion)" = "$NEXT" ]       || fail "CFBundleVersion is $(plist CFBundleVersion), expected $NEXT"
[ "$(plist CFBundleShortVersionString)" = "$MARKETING" ] || fail "version is $(plist CFBundleShortVersionString), expected $MARKETING"
[ -z "$(plist DevLoginEmail)" ]                || fail "DevLoginEmail is set in the Release build"
case "$(plist GymServiceURL)" in https://*) ;; *) fail "GymServiceURL is not https: $(plist GymServiceURL)";; esac
case "$(plist SupabaseURL)" in https://*) ;; *) fail "SupabaseURL is not https: $(plist SupabaseURL)";; esac
[ -n "$(plist SupabaseAnonKey)" ]              || fail "SupabaseAnonKey is empty"
[ "$(plist ITSAppUsesNonExemptEncryption)" = "false" ] || fail "ITSAppUsesNonExemptEncryption missing"
# LiveKit references camera APIs, so Apple wants this even though Gym never
# uses the camera (ITMS-90683 rejected build 2 for it).
[ -n "$(plist NSCameraUsageDescription)" ]     || fail "NSCameraUsageDescription is missing"
[ -n "$(plist NSMicrophoneUsageDescription)" ] || fail "NSMicrophoneUsageDescription is missing"
[ -f "$APP/PrivacyInfo.xcprivacy" ]            || fail "PrivacyInfo.xcprivacy is not in the app bundle"
codesign -d --entitlements :- "$APP" 2>/dev/null | grep -q com.apple.developer.applesignin \
  || fail "the signed app lacks the Sign in with Apple entitlement"
echo "version $MARKETING ($NEXT), production URLs, privacy manifest, Sign in with Apple: ok"

# --- upload ----------------------------------------------------------------
# destination=upload in ExportOptions.plist: export and upload are one step.
step "Exporting and uploading to App Store Connect"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/export \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

# --- record the number -----------------------------------------------------
# Only after a successful upload: a number Apple never saw is still free.
step "Recording build $NEXT in ios/project.yml"
sed -i '' "s/^\( *CURRENT_PROJECT_VERSION: *\)\"\{0,1\}$LOCAL\"\{0,1\}$/\1\"$NEXT\"/" project.yml
grep -q "CURRENT_PROJECT_VERSION: \"$NEXT\"" project.yml || fail "could not write build $NEXT to project.yml"
if [ "$COMMIT" = 1 ]; then
  git -C "$ROOT" commit --quiet -m "Release iOS $MARKETING ($NEXT)" -- ios/project.yml
  echo "committed: $(git -C "$ROOT" log -1 --format='%h %s')"
fi

# --- wait for processing (optional) ------------------------------------------
if [ "$WAIT" = 1 ]; then
  step "Waiting for App Store Connect to process build $NEXT"
  for _ in $(seq 1 60); do
    STATE=$(ASC build-state "$BUNDLE_ID" "$NEXT" || echo UNKNOWN)
    echo "  $(date +%H:%M:%S) $STATE"
    case "$STATE" in VALID) break ;; INVALID|FAILED) fail "processing ended in $STATE" ;; esac
    sleep 30
  done
fi

printf '\n==> Uploaded Gym %s (%s)\n\n' "$MARKETING" "$NEXT"
if [ "$WAIT" = 1 ]; then
  echo "Processed. Testers in the \"Internal\" group get it in the TestFlight app now."
else
  echo "Apple takes about 5 to 15 minutes to process it (run with --wait to watch)."
  echo "Testers in the \"Internal\" group then get it in the TestFlight app."
fi
