// The one channel the editor reports problems on. docs/ERRORS.md says what is reported, what throws and what is isolated;
// error-model.test.ts compares that page's code table with WARNING_CODES.

/** Why a warning was made. The codes are stable: a host can switch on them. */
export const WARNING_CODES = [
  "plugin-failed", "plugin-rejected", "plugin-message", "key-conflict", "content-too-long", "content-unreadable",
  "copy-failed", "upload-failed", "bad-option", "missing-label", "late-options", "listener-failed", "unsupported-browser",
] as const;

/** One of the codes in `WARNING_CODES`. */
export type WarningCode = (typeof WARNING_CODES)[number];

/** A problem the editor carried on from, reported to `onWarning`. Never thrown. */
export interface Warning {
  readonly code: WarningCode;
  /** For a person: what happened and what was done about it. */
  readonly message: string;
  /** The plugin it concerns, when there is one. */
  readonly plugin?: string;
  /** The error that was caught, when one was. */
  readonly error?: unknown;
}

/** What an error says, whatever was thrown. */
export const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));
