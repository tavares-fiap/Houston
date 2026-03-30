// Structured server-side logger for pipeline observability.
// Output format: [ISO timestamp] [STEP] EVENT  {"key": "value", ...}

function formatLine(step: string, event: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${step}] ${event}`;
  return data && Object.keys(data).length > 0
    ? `${base}  ${JSON.stringify(data)}`
    : base;
}

export function log(step: string, event: string, data?: Record<string, unknown>): void {
  console.log(formatLine(step, event, data));
}

export function logError(
  step: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errorData: Record<string, unknown> = {
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
    ...context,
  };
  console.error(formatLine(step, "error", errorData));
}
