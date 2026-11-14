#!/usr/bin/env python3
"""Read-only App Store Connect API helper for release-ios.sh.

  asc.py latest-build <bundle-id>      highest build number Apple has seen (0 if none)
  asc.py install-profile <name>        download a provisioning profile into Xcode
  asc.py build-state <bundle-id> <n>   processing state of build n

Reads ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH from the environment. Only
GET requests: the upload key is App Manager, which cannot create identifiers
or profiles anyway. Never prints the key or its ids. Needs PyJWT with
cryptography (pip3 install 'pyjwt[crypto]').
"""
import base64, json, os, sys, time, urllib.parse, urllib.request

import jwt  # PyJWT

API = "https://api.appstoreconnect.apple.com"


def token():
    key = open(os.environ["ASC_KEY_PATH"]).read()
    now = int(time.time())
    return jwt.encode(
        {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
        key, algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"]},
    )


def get(path, **params):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token()})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def app_id(bundle):
    apps = get("/v1/apps", **{"filter[bundleId]": bundle})["data"]
    if not apps:
        sys.exit(f"no App Store Connect app for {bundle}")
    return apps[0]["id"]


def uploads(app):
    # Every upload, including ones Apple rejected (those never become builds
    # but still use up their number).
    return get(f"/v1/apps/{app}/buildUploads", limit="200")["data"]


def latest_build(bundle):
    app = app_id(bundle)
    builds = get("/v1/builds", **{"filter[app]": app, "limit": "200", "fields[builds]": "version"})["data"]
    versions = [b["attributes"]["version"] for b in builds]
    versions += [u["attributes"]["cfBundleVersion"] for u in uploads(app)]
    print(max((int(v) for v in versions if v.isdigit()), default=0))


def build_state(bundle, number):
    """VALID when ready to test; FAILED with Apple's reasons on stderr."""
    app = app_id(bundle)
    builds = get("/v1/builds", **{"filter[app]": app, "filter[version]": number,
                                  "fields[builds]": "processingState"})["data"]
    if builds:
        print(builds[0]["attributes"]["processingState"])
        return
    for u in uploads(app):
        a = u["attributes"]
        if a["cfBundleVersion"] == number:
            state = a["state"]
            for e in state.get("errors", []):
                print(f'ITMS-{e["code"]}: {e["description"]}', file=sys.stderr)
            print(state["state"])
            return
    print("NOT_FOUND")


def install_profile(name):
    found = get("/v1/profiles", **{"filter[name]": name})["data"]
    if not found:
        sys.exit(f'no provisioning profile named "{name}"')
    a = found[0]["attributes"]
    if a["profileState"] != "ACTIVE":
        sys.exit(f'profile "{name}" is {a["profileState"]}; regenerate it in the developer portal')
    data = base64.b64decode(a["profileContent"])
    for d in ("~/Library/Developer/Xcode/UserData/Provisioning Profiles",
              "~/Library/MobileDevice/Provisioning Profiles"):
        d = os.path.expanduser(d)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, a["uuid"] + ".mobileprovision"), "wb").write(data)
    print(f'installed "{name}" (expires {a["expirationDate"][:10]})')


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    {"latest-build": latest_build, "install-profile": install_profile, "build-state": build_state}[cmd](*args)
