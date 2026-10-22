// A deliberately small named-entity table: the Latin-1 set plus the punctuation and symbols that word
// processors and web pages actually emit. Numeric references are always decoded. Anything else stays as written.

const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest " +
  "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig " +
  "agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";

const table = new Map<string, string>();
LATIN1.split(" ").forEach((name, i) => table.set(name, String.fromCharCode(160 + i)));
for (const [name, code] of Object.entries({
  amp: 38, lt: 60, gt: 62, quot: 34, apos: 39, ensp: 8194, emsp: 8195, thinsp: 8201, zwnj: 8204, zwj: 8205,
  lrm: 8206, rlm: 8207, ndash: 8211, mdash: 8212, lsquo: 8216, rsquo: 8217, sbquo: 8218, ldquo: 8220,
  rdquo: 8221, bdquo: 8222, dagger: 8224, bull: 8226, hellip: 8230, permil: 8240, lsaquo: 8249,
  rsaquo: 8250, euro: 8364, trade: 8482, larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, minus: 8722,
  infin: 8734, ne: 8800, le: 8804, ge: 8805,
})) {
  table.set(name, String.fromCharCode(code));
}

const REFERENCE = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));?/g;

export function decodeEntities(input: string): string {
  if (!input.includes("&")) return input;
  return input.replace(REFERENCE, (whole, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (name !== undefined) return table.get(name) ?? whole;
    const code = dec !== undefined ? Number(dec) : Number.parseInt(hex as string, 16);
    if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "�";
    return String.fromCodePoint(code);
  });
}

export const escapeText = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");

export const escapeAttribute = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
