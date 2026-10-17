# Releasing the native app

Builds run on **EAS Build** (Expo's infrastructure), not on GitHub's runners
and not on a laptop. Everything below is a one-time setup followed by a
one-click dispatch.

## One-time setup

### 1. The Expo project

```sh
cd native
npx eas-cli login
npx eas-cli init          # prints the project id
```

`eas init` normally writes the id into `app.json` — this app uses a **dynamic**
config (`app.config.js`), which it cannot write to, so the id is passed in
instead:

- **CI**: set it as the repository **secret** `EAS_PROJECT_ID`
  (Settings → Secrets and variables → Actions → Secrets).
- **Locally**: `native/.env` (`cp .env.example .env`).

### The listing name and bundle id

The store listing's name and the bundle id are configuration, never committed
(`identifiers.js`): set them as the repository **secrets** `APP_DISPLAY_NAME`
and `APP_BUNDLE_ID`, and as EAS environment variables on the project. The name
does two jobs. It is the name under the icon (`expo.name`), and the bundle step
passes it to the web build, so the wordmark in the app's top bar says the same
thing (`scripts/web-build-env.mjs`). A `production` bundle refuses to build
without it; any other profile falls back to the project's own name, "Cycle".

### 2. The CI token

Create a **robot** access token at
`https://expo.dev/accounts/<account>/settings/access-tokens` — a robot cannot
sign in to the dashboard and owns no projects, so its blast radius is bounded —
and set it as the repository **secret** `EXPO_TOKEN`.

### 3. Store credentials

EAS holds these on the project, not in this repo:

```sh
npx eas-cli credentials          # iOS signing + Android keystore
```

For submission, fill in the placeholders in `eas.json` →
`submit.production`:

| Field                       | Where it comes from                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple ID (not committed)    | Asked for by `eas submit` when it signs in; never written into `eas.json`.                                                                                                                                                                                 |
| `ascAppId`                  | App Store Connect → the app → App Information → **Apple ID** (digits). Add it under `submit.production.ios` once the app record exists; until then the key is absent, not a placeholder — `eas submit` rejects placeholder values before it does anything. |
| `appleTeamId`               | developer.apple.com → Membership details → **Team ID** (10 characters). Added beside `ascAppId`.                                                                                                                                                           |
| `play-service-account.json` | Play Console → Setup → API access → a service account key. Gitignored; upload it to EAS with `eas credentials` rather than committing it.                                                                                                                  |

### 4. iOS capabilities

None. The app declares no entitlements: the reports are health data, and they
stay on the device. The App ID needs no
capability beyond the defaults — and should carry none the build does not use,
so if a container capability was ticked on it earlier, untick it before the
first store build.

### 5. Dropbox

None. The phone app offers no Dropbox: the build job passes no
`VITE_DROPBOX_*` secret to the web bundle, and the bundle, built with
`VITE_NATIVE_BUILD=on`, would hide Dropbox even if it were given one.

## Cutting a build

Dispatch **Actions → native → Run workflow** and pick:

| Input      | Meaning                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `platform` | `ios` (the default), `android` or `all`.                                                                                               |
| `profile`  | `development` (dev client), `preview` (internal, APK + simulator), `testflight` (store-signed, still ours), `production` (what ships). |
| `submit`   | Also submit to the stores. Refused on anything but `production`.                                                                       |

The job builds the web app, packs it into `native/assets/webroot.zip`, and
queues the build on EAS with `--no-wait` — it exits immediately, so watch the
build itself at <https://expo.dev>.

The **marketing version** comes from the repo root's `package.json`, so the app
and the website never disagree about which release they are. Store **build
numbers** are auto-incremented by EAS (`appVersionSource: remote`); nothing is
bumped by hand.

EAS installs with the Node that `eas.json` pins — `"node"` in every build
profile, the same major as `.nvmrc`. Without it EAS falls back to its image's
default Node, whose npm 10 reads the lockfile npm 11 wrote as out of sync and
stops the build at `npm ci` ("Missing: typescript@5.9.3 from lock file"). Move
the pin when `.nvmrc` moves.

## Doing it from a laptop instead

```sh
cd native
npm ci
npm run build:preview        # internal build
npm run build:testflight     # store-signed, to TestFlight
npm run build:production     # what ships
npm run submit
```

Each of those bundles the web app first — the wrapper serves that copy, and a
build without it launches to a blank screen.

## Checklist before a store build

- [ ] `make lint && make test && make build` is green at the repo root.
- [ ] `make native-typecheck` is green.
- [ ] `EXPO_PUBLIC_CYCLE_URL` is **unset** — a build that streams the website
      is the exact shape App Store guideline 4.2 rejects.
- [ ] The version in the root `package.json` is the one you mean to ship.
- [ ] On a real device, Settings has **no Sync section**, and About says the
      reports stay on this device.
- [ ] Settings → Export a backup opens the share sheet with
      `cycle-backup-<date>.json`, and saving it to Files gives a file that
      Settings → Restore from a backup reads back.
