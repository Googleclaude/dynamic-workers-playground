import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAdminListRequests } from "./lgpd-admin";

// Minimal in-memory KV stub matching the surface lgpd-admin uses.
function makeKv(
  entries: Array<{
    name: string;
    metadata?: Record<string, unknown>;
    value?: string;
  }>
) {
  return {
    list: async ({ prefix, limit }: { prefix: string; limit: number }) => ({
      keys: entries
        .filter((e) => e.name.startsWith(prefix))
        .slice(0, limit)
        .map((e) => ({ name: e.name, metadata: e.metadata })),
      list_complete: true,
    }),
    get: async (name: string) =>
      entries.find((e) => e.name === name)?.value ?? null,
  } as unknown as KVNamespace;
}

function makeEnv(over: Record<string, unknown> = {}): Env {
  return {
    LGPD_ADMIN_TOKEN: "s3cret-admin-token",
    LGPD_KV: makeKv([
      {
        name: "request:abc",
        metadata: {
          protocol: "LGPD-20260524-aaaa",
          requestType: "access",
          receivedAt: "2026-05-24T10:00:00.000Z",
        },
        value: JSON.stringify({ status: "received" }),
      },
      {
        name: "request:def",
        metadata: {
          protocol: "LGPD-20260524-bbbb",
          requestType: "correction",
          receivedAt: "2026-05-24T11:00:00.000Z",
        },
        value: JSON.stringify({ status: "completed" }),
      },
    ]),
    ...over,
  } as unknown as Env;
}

function req(token?: string, query = ""): Request {
  return new Request(`https://x/api/lgpd/admin/requests${query}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

afterEach(() => vi.restoreAllMocks());

describe("handleAdminListRequests — auth", () => {
  it("returns 503 when LGPD_ADMIN_TOKEN is not set", async () => {
    const env = makeEnv({ LGPD_ADMIN_TOKEN: undefined });
    const res = await handleAdminListRequests(req("anything"), env);
    expect(res.status).toBe(503);
  });

  it("returns 401 when no bearer token is provided", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleAdminListRequests(req(), makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 401 on wrong token", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleAdminListRequests(req("wrong-token"), makeEnv());
    expect(res.status).toBe(401);
  });

  it("emits a security-alert on auth failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await handleAdminListRequests(req("wrong"), makeEnv());
    expect(spy).toHaveBeenCalled();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.kind).toBe("security-alert");
    expect(logged.alertKind).toBe("admin-auth-failure");
  });

  it("accepts the correct token", async () => {
    const res = await handleAdminListRequests(
      req("s3cret-admin-token"),
      makeEnv()
    );
    expect(res.status).toBe(200);
  });
});

describe("handleAdminListRequests — listing", () => {
  it("lists all pending requests with metadata", async () => {
    const res = await handleAdminListRequests(
      req("s3cret-admin-token"),
      makeEnv()
    );
    const body = (await res.json()) as {
      count: number;
      items: Array<{ id: string; protocol: string; requestType: string }>;
    };
    expect(body.count).toBe(2);
    expect(body.items.map((i) => i.id).sort()).toEqual(["abc", "def"]);
    expect(body.items.find((i) => i.id === "abc")?.requestType).toBe("access");
  });

  it("filters by status when ?status= is given", async () => {
    const res = await handleAdminListRequests(
      req("s3cret-admin-token", "?status=completed"),
      makeEnv()
    );
    const body = (await res.json()) as {
      count: number;
      items: Array<{ id: string }>;
    };
    expect(body.count).toBe(1);
    expect(body.items[0].id).toBe("def");
  });

  it("returns 503 when KV is not bound", async () => {
    const res = await handleAdminListRequests(
      req("s3cret-admin-token"),
      makeEnv({ LGPD_KV: undefined })
    );
    expect(res.status).toBe(503);
  });
});
