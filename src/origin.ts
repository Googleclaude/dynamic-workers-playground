// Reject browser POSTs from other origins. Non-browser clients (no Origin
// header) are allowed because they're outside the CSRF threat model.
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const host = request.headers.get("Host") ?? "";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
