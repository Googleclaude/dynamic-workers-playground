import { describe, expect, it } from "vitest";
import {
  isAllowedOriginHeader,
  validateAuditTs,
  validateRightsRequestBody,
} from "./lgpd";

const HASH64 = "a".repeat(64);

describe("isAllowedOriginHeader (CSRF guard)", () => {
  it("allows when Origin is absent (non-browser client)", () => {
    expect(isAllowedOriginHeader(null, "example.com")).toBe(true);
  });

  it("allows same-host Origin", () => {
    expect(
      isAllowedOriginHeader("https://example.com", "example.com")
    ).toBe(true);
    expect(
      isAllowedOriginHeader("https://example.com:443", "example.com:443")
    ).toBe(true);
  });

  it("rejects cross-origin", () => {
    expect(
      isAllowedOriginHeader("https://evil.com", "example.com")
    ).toBe(false);
    expect(
      isAllowedOriginHeader("https://example.com.evil.com", "example.com")
    ).toBe(false);
  });

  it("rejects malformed Origin", () => {
    expect(isAllowedOriginHeader("not a url", "example.com")).toBe(false);
    expect(isAllowedOriginHeader("", "example.com")).toBe(true); // empty == null
  });

  it("rejects when Origin port differs from host port", () => {
    expect(
      isAllowedOriginHeader("https://example.com:8080", "example.com:443")
    ).toBe(false);
  });
});

describe("validateAuditTs (timestamp forging guard)", () => {
  const NOW = Date.parse("2026-05-24T12:00:00.000Z");

  it("accepts a valid ISO ts within window", () => {
    expect(validateAuditTs("2026-05-24T11:59:00.000Z", NOW)).toBe(
      "2026-05-24T11:59:00.000Z"
    );
  });

  it("accepts ts up to 5 min in the future (clock skew)", () => {
    expect(validateAuditTs("2026-05-24T12:04:59.000Z", NOW)).not.toBeNull();
  });

  it("rejects ts more than 5 min in the future", () => {
    expect(validateAuditTs("2026-05-24T12:06:00.000Z", NOW)).toBeNull();
  });

  it("accepts ts up to 24 h in the past", () => {
    expect(validateAuditTs("2026-05-23T12:00:01.000Z", NOW)).not.toBeNull();
  });

  it("rejects ts more than 24 h in the past", () => {
    expect(validateAuditTs("2026-05-23T11:59:00.000Z", NOW)).toBeNull();
  });

  it("rejects backdated epoch ts", () => {
    expect(validateAuditTs("1970-01-01T00:00:00.000Z", NOW)).toBeNull();
  });

  it("rejects far-future ts", () => {
    expect(validateAuditTs("9999-12-31T23:59:59.999Z", NOW)).toBeNull();
  });

  it("rejects non-ISO formats", () => {
    expect(validateAuditTs("2026-05-24", NOW)).toBeNull();
    expect(validateAuditTs("2026/05/24 12:00:00", NOW)).toBeNull();
    expect(validateAuditTs("not a date", NOW)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(validateAuditTs(undefined, NOW)).toBeNull();
    expect(validateAuditTs(1716552000000, NOW)).toBeNull();
    expect(validateAuditTs(null, NOW)).toBeNull();
    expect(validateAuditTs({}, NOW)).toBeNull();
  });

  it("rejects non-UTC ISO (no Z suffix)", () => {
    // Local-time ISO without timezone is ambiguous; require explicit UTC.
    expect(validateAuditTs("2026-05-24T12:00:00", NOW)).toBeNull();
    expect(validateAuditTs("2026-05-24T12:00:00+00:00", NOW)).toBeNull();
  });
});

describe("validateRightsRequestBody", () => {
  const valid = {
    requestType: "access",
    nameHash: HASH64,
    emailHash: HASH64,
    details: "I'd like a copy of my data",
    confirmedSubject: true,
  };

  it("accepts a valid payload", () => {
    expect(validateRightsRequestBody(valid)).toBeNull();
  });

  it("accepts a valid payload with optional cpfHash", () => {
    expect(validateRightsRequestBody({ ...valid, cpfHash: HASH64 })).toBeNull();
  });

  it("rejects unknown requestType", () => {
    expect(
      validateRightsRequestBody({ ...valid, requestType: "delete-all" }),
    ).toBe("invalid-request-type");
  });

  it("rejects malformed nameHash", () => {
    expect(
      validateRightsRequestBody({ ...valid, nameHash: "short" }),
    ).toBe("invalid-name-hash");
  });

  it("rejects malformed emailHash", () => {
    expect(
      validateRightsRequestBody({ ...valid, emailHash: "ZZZ" }),
    ).toBe("invalid-email-hash");
  });

  it("rejects empty details", () => {
    expect(validateRightsRequestBody({ ...valid, details: "" })).toBe(
      "details-length",
    );
  });

  it("rejects details over 2000 chars", () => {
    expect(
      validateRightsRequestBody({ ...valid, details: "x".repeat(2001) }),
    ).toBe("details-length");
  });

  it("rejects confirmedSubject !== true", () => {
    expect(
      validateRightsRequestBody({ ...valid, confirmedSubject: false }),
    ).toBe("subject-not-confirmed");
  });

  it("rejects malformed cpfHash when present", () => {
    expect(
      validateRightsRequestBody({ ...valid, cpfHash: "not-hex" }),
    ).toBe("invalid-cpf-hash");
  });
});
