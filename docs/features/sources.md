# Sources

The forecast is arithmetic over your own reports, but some of its numbers come
from somebody else: the 28-day cycle it assumes before it knows yours, the
fortnight from ovulation to the next period, the fertile days around
ovulation, how much a waking temperature rises after it and the rule that
spots the rise, when mood swings and desire tend to come in a cycle, and the
statistics that turn a history into a range of likely days. **Settings →
About and sources** lists where each one comes from.

The sources are grouped by what they serve — the cycle and the period,
ovulation and the fertile days, waking temperature, and mood — the strongest
evidence first: a guideline before a large study, a study before a health
service's page. Each one says:

- what kind of evidence it is, and when it was published;
- its title, and its authors or publisher;
- one line on what in the forecast rests on it;
- **What the app took from it** — the source's own words, in its own language,
  with the page or table they are on, so you can check a number against where
  it came from rather than take the app's word for it;
- a link to the paper's DOI or the page itself, which opens in your browser and
  is the only thing on the screen that reaches the internet — and only when you
  tap it. The list itself is part of the app and works offline.

Where the app departs from a source, it says so — the luteal phase is set to
the textbook 14 days although a large app dataset puts the average nearer 12,
which is why the forecast learns your own from your tests and temperatures.

The screen also carries the app's disclaimer: the forecast is an estimate from
your own reports — not medical advice, and not contraception.

The list is the app's references registry, `docs/references.json`, the same file
the code cites by id beside every number it takes from a source — so a source is
on this screen the moment the forecast rests on it. See
[Where the numbers come from](../architecture.md#where-the-numbers-come-from).
