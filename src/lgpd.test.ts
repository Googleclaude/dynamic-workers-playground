import { describe, expect, it } from "vitest";
import { decryptString } from "./encryption";
import { handleConsentAudit, handleRightsRequest } from "./lgpd";

// A 64-char lowercase-hex string, the shape the handlers expect for the
// client-supplied subject hashes.
const HEX64 = "a".repeat(64);

function makeKv() {
  const store = new Map<string, string>();
  return {
    store,
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

interface EnvOpts {
  secret?: string | null;
  allowed?: boolean;
  kv?: ReturnType<typeof makeKv> | null;
  encKey?: string;
}

function makeEnv(opts: EnvOpts = {}) {
  const allowed = opts.allowed ?? true;
  return {
    LGPD_HASH_SECRET: opts.secret === null ? undefined : (opts.secret ?? "test-secret"),
    LGPD_KV_ENCRYPTION_KEY: opts.encKey,
    LGPD_KV: opts.kv === null ? undefined : (opts.kv ?? makeKv()),
    LgpdRateLimit: {
      idFromName: (n: string) => n,
      get: () => ({ check: async () => ({ allowed, remaining: 4 }) }),
    },
  } as unknown as Parameters<typeof handleRightsRequest>[1];
}

function postReq(body: unknown) {
  return new Request("https://app.example/api/lgpd/rights-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validRights = {
  requestType: "access",
  nameHash: HEX64,
  emailHash: HEX64,
  details: "Quero acessar meus dados",
  locale: "pt-BR",
  confirmedSubject: true,
};

describe("handleRightsRequest — gating", () => {
  it("returns 503 when the hash secret is missing", async () => {
    const res = await handleRightsRequest(postReq(validRights), makeEnv({ secret: null }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("secret-unavailable");
  });

  it("returns 429 when rate-limited", async () => {
    const res = await handleRightsRequest(postReq(validRights), makeEnv({ allowed: false }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate-limited");
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await handleRightsRequest(postReq("{ not json"), makeEnv());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid-json");
  });
});

describe("handleRightsRequest — validation", () => {
  it("rejects a missing requestType and names the field", async () => {
    const { requestType, ...rest } = validRights;
    void requestType;
    const res = await handleRightsRequest(postReq(rest), makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid-payload");
    expect(body.field).toBe("requestType");
  });

  it("rejects a malformed nameHash", async () => {
    const res = await handleRightsRequest(
      postReq({ ...validRights, nameHash: "not-hex" }),
      makeEnv()
    );
    expect((await res.json()).field).toBe("nameHash");
  });

  it("rejects when confirmedSubject is not true", async () => {
    const res = await handleRightsRequest(
      postReq({ ...validRights, confirmedSubject: false }),
      makeEnv()
    );
    expect((await res.json()).field).toBe("confirmedSubject");
  });

  it("rejects details over the length cap", async () => {
    const res = await handleRightsRequest(
      postReq({ ...validRights, details: "x".repeat(2001) }),
      makeEnv()
    );
    expect((await res.json()).field).toBe("details");
  });
});

describe("handleRightsRequest — persistence", () => {
  it("returns 503 when KV is unbound", async () => {
    const res = await handleRightsRequest(postReq(validRights), makeEnv({ kv: null }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("storage-unavailable");
  });

  it("persists a protocol record on the happy path", async () => {
    const kv = makeKv();
    const res = await handleRightsRequest(postReq(validRights), makeEnv({ kv }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocol).toMatch(/^LGPD-\d{8}-[0-9a-f]{8}$/);

    const requestKey = [...kv.store.keys()].find((k) => k.startsWith("request:"));
    expect(requestKey).toBeDefined();
    const record = JSON.parse(kv.store.get(requestKey!)!);
    // Subject hashes are re-HMAC'd server-side, so they must NOT equal the
    // raw client hash that came over the wire.
    expect(record.subject.nameHash).not.toBe(HEX64);
    expect(record.subject.nameHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores details in plaintext when no encryption key is set", async () => {
    const kv = makeKv();
    await handleRightsRequest(postReq(validRights), makeEnv({ kv }));
    const key = [...kv.store.keys()].find((k) => k.startsWith("request:"))!;
    const record = JSON.parse(kv.store.get(key)!);
    expect(record.detailsEncrypted).toBe(false);
    expect(record.details).toBe("Quero acessar meus dados");
  });

  it("encrypts details at rest when an encryption key is set", async () => {
    const kv = makeKv();
    await handleRightsRequest(
      postReq(validRights),
      makeEnv({ kv, encKey: "kv-encryption-key" })
    );
    const key = [...kv.store.keys()].find((k) => k.startsWith("request:"))!;
    const record = JSON.parse(kv.store.get(key)!);
    expect(record.detailsEncrypted).toBe(true);
    expect(record.details).not.toBe("Quero acessar meus dados");
    expect(await decryptString("kv-encryption-key", record.details)).toBe(
      "Quero acessar meus dados"
    );
  });
});

describe("handleConsentAudit", () => {
  const validConsent = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    version: "1.0.0",
    categories: { necessary: true, functional: false },
    method: "reject-all",
  };

  it("rejects an invalid method and names the field", async () => {
    const res = await handleConsentAudit(
      postReq({ ...validConsent, method: "bogus" }),
      makeEnv()
    );
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("method");
  });

  it("rejects a non-UUID id", async () => {
    const res = await handleConsentAudit(
      postReq({ ...validConsent, id: "not-a-uuid" }),
      makeEnv()
    );
    expect((await res.json()).field).toBe("id");
  });

  it("records an authoritative serverTs and ignores a backdated clientTs", async () => {
    const kv = makeKv();
    const backdated = "2000-01-01T00:00:00.000Z";
    const res = await handleConsentAudit(
      postReq({ ...validConsent, ts: backdated }),
      makeEnv({ kv })
    );
    expect((await res.json()).ok).toBe(true);
    const record = JSON.parse(kv.store.get(`consent-audit:${validConsent.id}`)!);
    // clientTs is retained as metadata, but serverTs is "now", not the
    // backdated value.
    expect(record.clientTs).toBe(backdated);
    expect(record.serverTs).not.toBe(backdated);
    expect(new Date(record.serverTs).getUTCFullYear()).toBeGreaterThan(2000);
  });
});
