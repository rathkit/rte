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
