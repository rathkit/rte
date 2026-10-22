# Paste handling: free and paid

Decided 2026-10-21. It follows the public Free and paid page (`/docs/free-and-paid/` on rathkit.com).

## The line

Free paste turns whatever the standard clipboard HTML can express into correct, safe content.
Paid paste recovers information that HTML does not carry in a standard form.

| Behavior | Tier |
| --- | --- |
| Strip Office and Google markup noise (`mso-*`, `Mso*`, `SCXW`/`BCX` classes, `ccp_infra`, `docs-internal-guid`, `paraid`) | Free |
| Merge one-item lists from Word and Docs into real, nested lists | Free |
| Add a scheme to scheme-less links; drop `file:` images | Free |
| Keep `colspan`, `rowspan`, emphasis, links and heading tags | Free |
| Resolve spreadsheet `<style>` classes (fills, bold, number formats) | Paid |
| Typed cell values and formulas | Paid |
| Infer headings where the source sends none | Paid |
| Recover image bytes that exist only in RTF | Paid |

## Rules this must keep

- Paid paste uses the public plugin API only. It gets no private hooks.
- Free packages never import paid ones.
- A correctness bug in free paste is fixed in free paste. It is never held back for a paid tier.
- The plugin API gives a plugin the raw `clipboardData` (HTML, RTF and plain text) before the default sanitizer runs.

## Test material

Scrubbed captures from real Office, Google and LibreOffice copies are in `fixtures/paste/`. The tool and the
scrubber are in `tools/paste-capture/`.

## Recognizers added in the first slice: tier needs the owner's confirmation

The table above is the owner's decision. These behaviors were built while the paste suites were being
passed, and some sit near the line. Each is listed with the tier it is built as today. None is final.

| Behavior | Built as | Why it might be paid |
| --- | --- | --- |
| Word-processor list paragraphs (`mso-list`) rebuilt as nested lists | Free | Office-specific recognition. Without it a Word bullet list pastes as paragraphs starting with a bullet character |
| The same, when the wrapper around the marker is gone and only the literal marker text is left | Free | Same |
| A paragraph with `role="heading"` and `aria-level` becomes a heading | Free | Standard ARIA, but the table above lists "infer headings where the source sends none" as paid. Inferring from bold or large text is still not done and stays paid |
| Marker styles read from Word-for-web's `data-list-defn-props` JSON | Free | Proprietary attribute. Formats 1 and 3 are unverified |
| Table rows that arrive without their table; bold set on a cell or row; a `<pre>` wrapper around a table | Free | Standard markup |

Scenarios that depend on them: ten desktop-source scenarios in the word-processor suite need the `mso-list`
rebuild, and six web-source scenarios need `role="heading"`. If any of these becomes paid, the free target
in `CONFORMANCE.md` drops by that many.
