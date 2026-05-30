import { afterEach, describe, expect, it, vi } from "vitest";
import { reportSecurityEvent } from "./security-events";

afterEach(() => vi.restoreAllMocks());

describe("reportSecurityEvent", () => {
  it("emits a structured security-alert on console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportSecurityEvent({}, {
      kind: "secret-in-source",
      detail: { count: 2, rules: "aws-access-key,openai-key" },
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.source).toBe("lgpd-security-alert");
    expect(logged.kind).toBe("security-alert");
    expect(logged.alertKind).toBe("secret-in-source");
    expect(logged.count).toBe(2);
    expect(logged.rules).toBe("aws-access-key,openai-key");
    expect(typeof logged.ts).toBe("string");
  });

  it("does not fire a webhook when LGPD_ALERT_WEBHOOK is unset", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null)
    );
    reportSecurityEvent({}, {
      kind: "admin-auth-failure",
      detail: { endpoint: "admin/requests" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fires a webhook (redirect: manual) when configured, via ctx.waitUntil", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null));
    const waited: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => waited.push(p) };

    reportSecurityEvent(
      { LGPD_ALERT_WEBHOOK: "https://hooks.example.com/lgpd" },
      { kind: "lgpd-validation-burst", detail: { count: 11 } },
      ctx
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [target, init] = fetchSpy.mock.calls[0];
    expect(target).toBe("https://hooks.example.com/lgpd");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).redirect).toBe("manual");
    expect(waited.length).toBe(1);
  });

  it("never throws when the webhook rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const waited: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => waited.push(p) };
    expect(() =>
      reportSecurityEvent(
        { LGPD_ALERT_WEBHOOK: "https://hooks.example.com/lgpd" },
        { kind: "secret-in-source", detail: { count: 1 } },
        ctx
      )
    ).not.toThrow();
    // The swallowed rejection resolves cleanly (caught internally).
    await expect(Promise.all(waited)).resolves.toBeDefined();
  });
});
