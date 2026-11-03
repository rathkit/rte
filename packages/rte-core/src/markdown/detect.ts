// Does plain text look like Markdown? Conservative on purpose: text that is only prose, a path, a shell comment or a
// sum with asterisks must stay as typed. Each kind of sign scores; two points are needed. Linear in the text.
const LIMIT = 200_000;
const LINE_LIMIT = 2_000;

const isList = (line: string): boolean => /^ {0,6}(?:[-*+]|\d{1,9}[.)])[ \t]+\S/.test(line.slice(0, 64));
const isRow = (line: string): boolean => line.includes("|") && /^[\s|:-]+$/.test(line) && line.includes("-");

/** An inline pair such as `**word**`: the inside must start and end with a non-space. */
function pair(text: string, mark: string): boolean {
  let from = 0;
  for (let tries = 0; tries < 50; tries++) {
    const a = text.indexOf(mark, from);
    if (a === -1) return false;
    const inner = a + mark.length;
    if (!/\s/.test(text.charAt(inner)) && inner < text.length) {
      const b = text.indexOf(mark, inner + 1);
      if (b !== -1 && !/\s/.test(text.charAt(b - 1)) && text.slice(inner, b).indexOf("\n\n") === -1) return true;
    }
    from = a + mark.length;
  }
  return false;
}

function link(text: string): boolean {
  let from = 0;
  for (let tries = 0; tries < 50; tries++) {
    const mid = text.indexOf("](", from);
    if (mid === -1) return false;
    const open = text.lastIndexOf("[", mid);
    const close = text.indexOf(")", mid);
    const label = open === -1 ? "" : text.slice(open + 1, mid);
    if (open !== -1 && close !== -1 && label !== "" && !label.includes("\n") && close - mid < 2000) return true;
    from = mid + 2;
  }
  return false;
}

export function looksLikeMarkdown(input: string): boolean {
  const text = input.length > LIMIT ? input.slice(0, LIMIT) : input;
  const lines = text.split(/\r\n?|\n/);
  let headings = 0, listLines = 0, tasks = 0, quotes = 0, notes = 0;
  let fence = false, table = false;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] as string).slice(0, LINE_LIMIT);
    if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) fence = true;
    else if (/^ {0,3}#{1,6}[ \t]+\S/.test(line)) headings++;
    else if (/^ {0,3}>/.test(line)) quotes++;
    else if (/^ {0,3}\[\^[^\]\s]{1,64}\]:[ \t]*\S/.test(line)) notes++;
    else if (isList(line)) { listLines++; if (/^\s*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\][ \t]/.test(line)) tasks++; }
    else if (line.includes("|") && i + 1 < lines.length && isRow((lines[i + 1] as string).slice(0, LINE_LIMIT)) && line.replace(/[\s|]/g, "") !== "") table = true;
  }
  let score = 0;
  if (fence) score += 3;
  if (table) score += 3;
  if (headings > 0) score += headings > 1 ? 2 : 1;
  if (listLines >= 2) score += 2;
  if (tasks > 0) score += 2;
  if (quotes > 0) score += 1;
  if (notes > 0) score += 2;
  if (link(text)) score += 2;
  if (pair(text, "**") || pair(text, "~~")) score += 2;
  if (pair(text, "`")) score += 1;
  return score >= 2;
}
