// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  ArrowLeftIcon,
  InfoIcon,
  ScrollTextIcon,
  Section,
  SpinnerIcon,
} from "@niclaslindstedt/oss-framework/components";
import {
  byTopic,
  EVIDENCE,
  ReferenceCard,
  type Evidence,
  type ReferenceCardLabels,
} from "@niclaslindstedt/oss-framework/references";

import { useT } from "./i18n/index.ts";
import { TOPICS, useReferences } from "./references.ts";

// About, behind Settings: what the app is, and every published source the
// forecast's numbers rest on. The list is the references
// registry itself, read through `references.ts` — never a copy kept by hand —
// grouped by the part of the forecast each source serves and ranked strongest
// evidence first.
//
// Each source is the framework's `ReferenceCard` in this app's words: cited
// the way a reference list cites it, with a line on what in the app rests on
// it, and — one tap down — the source's own words, so the claim can be
// checked against them. The link out is the only way this screen reaches the
// network, and only when it is tapped.
//
// Read-only: it writes nothing.

type Props = {
  /** Back to Settings, where the screen was opened from. */
  onBack: () => void;
};

export function AboutScreen({ onBack }: Props) {
  const t = useT();
  const refs = useReferences();

  const labels: ReferenceCardLabels = {
    quotes: t("about.quotes"),
    openSource: t("about.openSource"),
    isbn: (isbn) => t("about.isbn", { isbn }),
    accessed: (date) => t("about.accessed", { date }),
    evidence: Object.fromEntries(
      EVIDENCE.map((kind) => [kind, t(`about.evidence.${kind}` as const)]),
    ) as Record<Evidence, string>,
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-accent hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {t("nav.settings")}
        </button>
      </div>

      <Section
        title={t("about.title")}
        icon={<InfoIcon className="h-3.5 w-3.5" />}
      >
        <p className="text-sm leading-snug text-fg">
          {t("forecast.disclaimer")}
        </p>
        <p className="text-xs leading-snug text-muted">
          {t("settings.privacy")}
        </p>
      </Section>

      <Section
        title={t("about.sources")}
        icon={<ScrollTextIcon className="h-3.5 w-3.5" />}
      >
        <p className="text-sm leading-snug text-fg">
          {t("about.sourcesIntro")}
        </p>
      </Section>

      {refs === null ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 py-6 text-sm text-muted"
        >
          <SpinnerIcon className="h-4 w-4 animate-spin" />
          {t("about.loading")}
        </p>
      ) : (
        byTopic(refs, TOPICS).map((group) => (
          <section key={group.topic} className="flex flex-col gap-2">
            <h2 className="px-1 pt-2 text-xs font-bold tracking-wide text-muted uppercase">
              {t(`about.topics.${group.topic}` as const)}
            </h2>
            {group.refs.map((ref) => (
              <ReferenceCard
                key={ref.id}
                reference={ref}
                lang="en"
                labels={labels}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
