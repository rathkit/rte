// The content policy: what the editor keeps and what it drops when it reads HTML (loading a document, pasting, `setHtml`).
// docs/CONTENT-POLICY.md says the same in words; policy.test.ts reads that page and these tables and fails when they differ.

/** Elements that are dropped together with everything inside them. */
export const DROPPED_ELEMENTS: ReadonlySet<string> = new Set([
  "script", "style", "link", "meta", "base", "object", "embed", "iframe", "frame", "frameset", "noscript", "template",
  "head", "textarea", "input", "select", "option", "button", "canvas", "audio", "video", "applet", "xml",
]);

/** Elements that only group blocks: they end the paragraph before and after, and what is inside is kept. */
export const GROUPING_ELEMENTS: ReadonlySet<string> = new Set([
  "div", "section", "article", "header", "footer", "aside", "nav", "figure", "figcaption", "address", "main", "form",
  "body", "html", "center", "details", "summary", "dd", "dt", "fieldset", "hgroup",
]);

export const DEFAULT_LINK_SCHEMES: readonly string[] = ["http", "https", "mailto", "tel"];
/** Schemes an image address may use. Not configurable: a `data:` address is checked separately. */
export const IMAGE_SCHEMES: readonly string[] = ["http", "https"];
/** The `data:` image types kept, with the first bytes (base64) their data must start with: the bytes are trusted, not the declared type. */
export const DATA_IMAGE_SIGNATURES: readonly (readonly [string, string])[] = [
  ["image/png", "iVBORw0KGgo"], ["image/jpeg", "/9j/"], ["image/gif", "R0lGOD"], ["image/webp", "UklGR"], ["image/bmp", "Qk"],
];

/** The limits on what is read. */
export interface ContentLimits {
  /** Longest markup read, in characters. Longer is refused whole: nothing is read and `onLimit` is told. */
  readonly maxInputLength: number;
  /** Deepest nesting of elements. An element nested deeper is dropped and what is inside it stays at the deepest allowed level. */
  readonly maxDepth: number;
  /** Longest `data:` image address, in characters. 0 refuses every `data:` image. */
  readonly maxDataImageLength: number;
}

/** A profile: the limits and the choices a host makes. */
export interface ContentPolicy extends ContentLimits {
  /** URL schemes a link may use besides relative and fragment addresses. */
  readonly linkSchemes: readonly string[];
  /** `semantic` keeps meaning only; `allowlist` also keeps text color, background and alignment. (Pasting is always `semantic`.) */
  readonly styles: "semantic" | "allowlist";
  /** Keep relative image addresses (`a.png`, `/a.png`) when pasting. Loading always keeps them. Default false in every profile. */
  readonly pasteRelativeImages: boolean;
}

/** The name of a profile in `CONTENT_PROFILES`. */
export type ContentProfile = "strict" | "standard" | "loose";

/** The three profiles. `standard` is the default; `strict` is for hosts that take content from people they do not trust; `loose` for hosts that trust theirs. */
export const CONTENT_PROFILES: Readonly<Record<ContentProfile, ContentPolicy>> = {
  strict: { pasteRelativeImages: false, linkSchemes: ["http", "https", "mailto"], styles: "semantic", maxDataImageLength: 0, maxDepth: 32, maxInputLength: 1_000_000 },
  standard: { pasteRelativeImages: false, linkSchemes: DEFAULT_LINK_SCHEMES, styles: "allowlist", maxDataImageLength: 12_000_000, maxDepth: 100, maxInputLength: 50_000_000 },
  loose: { pasteRelativeImages: false, linkSchemes: ["http", "https", "mailto", "tel", "sms", "ftp", "ftps"], styles: "allowlist", maxDataImageLength: 25_000_000, maxDepth: 200, maxInputLength: 200_000_000 },
};

/** What a host may say: a profile to start from, then single choices on top of it. */
export type ContentOptions = { readonly profile?: ContentProfile } & Partial<ContentPolicy>;

/**
 * The policy for the options: the profile (`standard` when none is named), with each given choice laid over it. A choice that
 * cannot be used (an unknown profile, a limit that is not a whole number of at least 0, a list that is not strings) is left out, the
 * profile's value is used, and `complain` is told.
 */
export function contentPolicy(options: ContentOptions = {}, complain: (message: string) => void = () => undefined): ContentPolicy {
  const { profile = "standard", ...rest } = options;
  if (!Object.hasOwn(CONTENT_PROFILES, profile)) complain(`content.profile "${String(profile)}" is not a profile: using standard (strict, standard or loose).`);
  const base = Object.hasOwn(CONTENT_PROFILES, profile) ? CONTENT_PROFILES[profile] : CONTENT_PROFILES.standard;
  const given: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    const ok =
      key === "linkSchemes" ? Array.isArray(value) && value.every((v) => typeof v === "string" && /^[a-z][a-z0-9+.-]*$/i.test(v))
      : key === "styles" ? value === "semantic" || value === "allowlist"
      : key === "pasteRelativeImages" ? typeof value === "boolean"
      : key === "maxDepth" ? Number.isInteger(value) && (value as number) >= 1
      : (key === "maxInputLength" || key === "maxDataImageLength") ? Number.isInteger(value) && (value as number) >= 0
      : false;
    if (ok) given[key] = value;
    else complain(`content.${key} cannot be ${JSON.stringify(value)}: using the ${profile in CONTENT_PROFILES ? profile : "standard"} profile's value.`);
  }
  return { ...base, ...given } as ContentPolicy;
}
