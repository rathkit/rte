// The design tokens: every custom property a theme sets and the styled interface reads. At most 50 in v1; a token that cannot be justified
// in the docs does not ship. Colors come in pairs that must keep their contrast (the tests check it for every theme).
export const TOKENS = [
  "--rk-accent",
  "--rk-accent-fg",
  "--rk-accent-subtle",
  "--rk-bg",
  "--rk-border",
  "--rk-border-subtle",
  "--rk-border-width",
  "--rk-brand",
  "--rk-brand-text",
  "--rk-control-active",
  "--rk-control-hover",
  "--rk-control-size",
  "--rk-danger",
  "--rk-fg",
  "--rk-fg-muted",
  "--rk-focus-color",
  "--rk-focus-offset",
  "--rk-focus-width",
  "--rk-font-content",
  "--rk-font-heading",
  "--rk-font-mono",
  "--rk-font-size",
  "--rk-font-ui",
  "--rk-line-height",
  "--rk-motion-duration",
  "--rk-radius-m",
  "--rk-radius-s",
  "--rk-selection-bg",
  "--rk-shadow-popover",
  "--rk-space-1",
  "--rk-space-2",
  "--rk-space-3",
  "--rk-space-4",
  "--rk-surface",
  "--rk-surface-raised",
] as const;

export type TokenName = (typeof TOKENS)[number];

/** Themes that ship as CSS files in this package. */
export const THEMES = ["light", "dark", "auto", "high-contrast"] as const;
export type ThemeName = (typeof THEMES)[number];
