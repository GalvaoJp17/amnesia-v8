// Placeholder logging utility that avoids PII/media.
export type SafeLogLevel = 'info' | 'warn' | 'error';

export function safelog(level: SafeLogLevel, message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console[level](`[Amnesia v8] ${message}`, details ?? {});
  }
}
