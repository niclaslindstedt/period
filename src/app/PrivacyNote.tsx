// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useT } from "./i18n/index.ts";

/** Where the store listing's privacy policy lives. It describes the phone
 *  app, so only the phone app links to it. */
export const PRIVACY_POLICY_URL = "https://apps.agilator.se/cycle/privacy/";

/**
 * Where the reports go, in the small print under Settings → About and on the
 * About screen: the build's own sentence (`settings.privacy`), and in the
 * phone app a link to the full policy. Tapping it opens the system browser —
 * the only way this reaches the network, and only when tapped.
 *
 * The build flag is tested here, at the use site, so the link leaves every
 * other build.
 */
export function PrivacyNote() {
  const t = useT();
  return (
    <>
      <p className="text-xs leading-snug text-muted">{t("settings.privacy")}</p>
      {import.meta.env.VITE_NATIVE_BUILD === "on" && (
        <p className="text-xs leading-snug">
          <a
            href={PRIVACY_POLICY_URL}
            className="text-accent underline-offset-2 hover:underline"
          >
            {t("settings.privacyPolicy")}
          </a>
        </p>
      )}
    </>
  );
}
