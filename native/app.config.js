// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Expo config, as a FUNCTION rather than a static app.json so the app's
// marketing version can be read from the web app's `package.json`. The wrapper
// has no version of its own — it ships one build of the cycle log, and the
// two must never disagree about which one. Store build numbers are
// auto-incremented by EAS (see eas.json), so nothing here is bumped by hand.

const { version } = require("../package.json");

// The listing's name and identifier, and the container the document syncs
// through. Build variables rather than literals — see ./identifiers.js.
const {
  DISPLAY_NAME,
  BUNDLE_ID,
  ICLOUD_CONTAINER,
} = require("./identifiers.js");

// The light theme's page background (`index.html`'s light `theme-color`).
// Only paints the splash and the chrome before the page reports its own.
const BRAND_BG = "#ffffff";

// The near-black the app mark is cut from (scripts/generate-icons.mjs's BG).
// The adaptive icon's foreground runs to the edges of its tile, so the layer
// behind it has to be the same ink or the launcher's mask shows a seam.
const MARK_INK = "#12101a";

// The EAS project this app builds under. `eas init` prints the id; paste it
// here or pass it in the environment (which is what CI does), because
// `eas init` cannot write into a dynamic config. Left unset, the project is
// simply unlinked and `eas build` will ask — it is not a build failure.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? "";

module.exports = () => ({
  expo: {
    name: DISPLAY_NAME,
    slug: "cycle",
    version,
    // One column: the calendar, the day's report and the charts are laid out
    // for a phone held upright, and nothing in them is measured for a wide
    // screen, so the app is pinned the way the reader holds it.
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    icon: "./assets/icon.png",
    // The URL scheme is the bundle id — reverse-DNS, as RFC 8252 §7.1 asks
    // of a private-use scheme, so it is this app's and nobody else's: a
    // one-word scheme can be claimed by any other app on the phone. It is
    // `se.agilator.cycle` in a store build and `dev.local.cycle` in a plain
    // checkout, from ./identifiers.js — never a literal here.
    scheme: BUNDLE_ID,
    backgroundColor: BRAND_BG,
    assetBundlePatterns: ["**/*"],

    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      entitlements: {
        // iCloud Documents: the app's own ubiquity container, which is what
        // `modules/icloud-store` reads and writes. Without all three of these
        // keys the container URL resolves to nil at runtime and the backend
        // reports itself unavailable — which is a misconfiguration, not a
        // state the user can fix.
        "com.apple.developer.icloud-container-identifiers": [ICLOUD_CONTAINER],
        "com.apple.developer.ubiquity-container-identifiers": [
          ICLOUD_CONTAINER,
        ],
        "com.apple.developer.icloud-services": ["CloudDocuments"],
      },
      infoPlist: {
        // Publishes the container's `Documents` folder to the Files app as a
        // folder called "Cycle", so the user can see, copy and back up the
        // log the app keeps there. Without this the container syncs but is
        // invisible — a log its owner cannot open.
        NSUbiquitousContainers: {
          [ICLOUD_CONTAINER]: {
            NSUbiquitousContainerIsDocumentScopePublic: true,
            NSUbiquitousContainerSupportedFolderLevels: "None",
            NSUbiquitousContainerName: "Cycle",
          },
        },
        // The bundled build is served over plain HTTP on the loopback
        // interface. ATS is left ON — only localhost is excepted, so nothing
        // else in the app may fall back to cleartext.
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: true,
          NSExceptionDomains: {
            localhost: {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: false,
            },
          },
        },
        // Skips the App Store export-compliance prompt: no non-exempt crypto.
        ITSAppUsesNonExemptEncryption: false,
      },
    },

    android: {
      package: BUNDLE_ID,
      // None. The wrapper reads no sensor, no contact and no file outside its
      // own sandbox — and Play's data-safety form is answered against this
      // list. iCloud is Apple's, so on Android the app is the web app served
      // from inside the download and nothing else.
      permissions: [],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: MARK_INK,
      },
    },

    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 180,
          resizeMode: "contain",
          backgroundColor: BRAND_BG,
        },
      ],
      // The bundled static server (lighttpd, via
      // @dr.pogodin/react-native-static-server) needs Android minSdk 28, and
      // the loopback origin is plain HTTP so cleartext has to be permitted.
      [
        "expo-build-properties",
        { android: { minSdkVersion: 28, usesCleartextTraffic: true } },
      ],
    ],

    extra: {
      // NO remote URL here, deliberately. The app serves the copy of the cycle
      // log bundled inside it (assets/webroot.zip) from a loopback server —
      // that is what makes it work offline, and what makes it an app rather
      // than a viewer for a website (App Store guideline 4.2). To point a
      // debug build at a deployed slot, set EXPO_PUBLIC_CYCLE_URL at build
      // time; src/config.ts reads that env var directly.
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  },
});
