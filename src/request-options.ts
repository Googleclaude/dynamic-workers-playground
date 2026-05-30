const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]);

export function normalizeMethod(method: unknown): string {
  if (typeof method !== "string") return "GET";
  const upper = method.toUpperCase();
  return ALLOWED_METHODS.has(upper) ? upper : "GET";
}

export function methodAllowsBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}
