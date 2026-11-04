// The design tokens: every custom property a theme sets and the styled interface reads. At most 50 in v1; a token that cannot be justified
// in the docs does not ship. Colors come in pairs that must keep their contrast (the tests check it for every theme).
export const TOKENS = [
  "--rte-accent",
  "--rte-accent-fg",
  "--rte-accent-subtle",
  "--rte-bg",
  "--rte-border",
  "--rte-border-subtle",
  "--rte-border-width",
  "--rte-brand",
  "--rte-brand-text",
  "--rte-control-active",
  "--rte-control-hover",
  "--rte-control-size",
  "--rte-danger",
  "--rte-fg",
  "--rte-fg-muted",
  "--rte-focus-color",
  "--rte-focus-offset",
  "--rte-focus-width",
  "--rte-font-content",
  "--rte-font-heading",
  "--rte-font-mono",
  "--rte-font-size",
  "--rte-font-ui",
  "--rte-line-height",
  "--rte-motion-duration",
  "--rte-radius-m",
  "--rte-radius-s",
  "--rte-selection-bg",
  "--rte-shadow-popover",
  "--rte-space-1",
  "--rte-space-2",
  "--rte-space-3",
  "--rte-space-4",
  "--rte-surface",
  "--rte-surface-raised",
] as const;

export type TokenName = (typeof TOKENS)[number];

/** Themes that ship as CSS files in this package. */
export const THEMES = ["light", "dark", "auto", "high-contrast"] as const;
export type ThemeName = (typeof THEMES)[number];
