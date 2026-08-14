// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/// <reference types="vite/client" />
//
// Vite's ambient client types: `import.meta.env` and the side-effecting asset
// imports (`import "./styles.css"`) both resolve through this.

// The app version, inlined by Vite's `define` (see `vite.config.ts`).
declare const __APP_VERSION__: string;

// The build identifier shown in Settings → About, composed at build time (see
// `vite.config.ts`): `<version>[.<run>][-<slot>][+<commit>]`.
declare const __BUILD_LABEL__: string;

// Build identity, inlined by Vite's `define` and shown in Settings → About:
// the short commit hash of the deployed source, and the CI run number ("dev"
// for a local build).
declare const __BUILD_COMMIT__: string;
declare const __BUILD_NUMBER__: string;

// Build-time env the app reads through `import.meta.env`. All optional — the
// app builds and runs with none of them set. See `docs/configuration.md`.
interface ImportMetaEnv {
  // Dropbox app key (PKCE public client). Unset hides the Dropbox backend in
  // Settings → Sync. See `src/app/useSyncEngine.ts`.
  readonly VITE_DROPBOX_APP_KEY?: string;
  // Google OAuth client id (GIS token client). Unset hides the Google Drive
  // backend. See `src/app/useSyncEngine.ts`.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // App-folder names the synced document is filed under, per provider.
  readonly VITE_DROPBOX_APP_FOLDER?: string;
  readonly VITE_GDRIVE_APP_FOLDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
