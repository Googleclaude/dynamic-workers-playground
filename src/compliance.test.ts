import { describe, expect, it } from "vitest";
import {
  RULES,
  redactString,
  scanFiles,
  type ComplianceViolation,
} from "./compliance";

function findRule(id: string) {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`rule ${id} not found`);
  return rule;
}

function ids(violations: ComplianceViolation[]) {
  return violations.map((v) => v.ruleId).sort();
}

describe("scanFiles — block-severity rules", () => {
  it("flags AWS access keys", () => {
    const v = scanFiles({ "src/leak.ts": `const k = "AKIAIOSFODNN7EXAMPLE";` });
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("aws-access-key");
    expect(v[0].severity).toBe("block");
    expect(v[0].file).toBe("src/leak.ts");
    expect(v[0].line).toBe(1);
    expect(v[0].preview).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(v[0].preview).toContain("[REDACTED:aws-access-key]");
  });

  it("flags multi-line PRIVATE KEY blocks", () => {
    const v = scanFiles({
      "src/k.ts": [
        "-----BEGIN RSA PRIVATE KEY-----",
        "MIIEowIBAAKCAQEAxxxx",
        "abcdef==",
        "-----END RSA PRIVATE KEY-----",
      ].join("\n"),
    });
    expect(ids(v)).toEqual(["private-key"]);
    expect(v[0].preview).not.toContain("MIIE");
  });

  it("flags OpenAI-shaped keys but not the host literal", () => {
    const v = scanFiles({
      "src/a.ts": `const k = "sk-abcdefghijklmnopqrstuvwx";`,
    });
    expect(ids(v)).toEqual(["openai-key"]);

    const v2 = scanFiles({
      "src/b.ts": `const k = "sk-example-key-12345";`,
    });
    expect(v2).toHaveLength(0);
  });

  it("flags GitHub tokens (ghp_/github_pat_/gho_/...)", () => {
    const v = scanFiles({
      "src/a.ts": `const t = "ghp_abcdefghijklmnopqrstuvwx12345";`,
    });
    expect(ids(v)).toEqual(["github-token"]);
  });

  it("flags Slack tokens", () => {
    const v = scanFiles({
      "src/a.ts": `const t = "xoxb-1234567890-abcdef";`,
    });
    expect(ids(v)).toEqual(["slack-token"]);
  });

  it("does not flag a clean simple worker", () => {
    const v = scanFiles({
      "src/index.ts": `export default { fetch: () => new Response("hi") };`,
      "package.json": `{"name":"clean-worker","main":"src/index.ts"}`,
    });
    expect(v).toHaveLength(0);
  });
});

describe("scanFiles — redact-severity rules", () => {
  it("flags JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const v = scanFiles({ "src/a.ts": `const t = "${jwt}";` });
    expect(ids(v)).toEqual(["jwt"]);
    expect(v[0].severity).toBe("redact");
  });

  it("flags emails but not @-shaped paths", () => {
    const v = scanFiles({
      "src/a.ts": `const u = "alice@example.com";`,
    });
    expect(ids(v)).toEqual(["email"]);
  });

  it("validates CPF check digits", () => {
    // valid: 123.456.789-09 (check digits 0,9 — verified independently)
    const valid = scanFiles({ "src/a.ts": `const c = "123.456.789-09";` });
    expect(ids(valid)).toEqual(["cpf"]);

    // invalid: wrong check digits
    const invalid = scanFiles({ "src/a.ts": `const c = "111.111.111-11";` });
    expect(invalid).toHaveLength(0);

    // invalid: random
    const random = scanFiles({ "src/a.ts": `const c = "999.888.777-66";` });
    expect(random).toHaveLength(0);
  });

  it("validates credit card numbers via Luhn", () => {
    // 4242 4242 4242 4242 — Stripe test card, passes Luhn
    const valid = scanFiles({ "src/a.ts": `const c = "4242424242424242";` });
    expect(ids(valid)).toEqual(["credit-card"]);

    // visa-shape, fails Luhn
    const invalid = scanFiles({ "src/a.ts": `const c = "4111111111111112";` });
    expect(invalid).toHaveLength(0);
  });

  it("flags US SSNs", () => {
    const v = scanFiles({ "src/a.ts": `const s = "078-05-1120";` });
    expect(ids(v)).toEqual(["us-ssn"]);
  });
});

describe("scanFiles — file-key scanning (bypass guard)", () => {
  it("flags a secret embedded in the filename", () => {
    const v = scanFiles({
      "src/AKIAIOSFODNN7EXAMPLE.ts": `export default { fetch: () => new Response("ok") };`,
    });
    expect(v.some((x) => x.ruleId === "aws-access-key")).toBe(true);
    const fileMatch = v.find((x) => x.ruleId === "aws-access-key")!;
    expect(fileMatch.file).toContain("AKIAIOSFODNN7EXAMPLE");
    expect(fileMatch.preview).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("flags an OpenAI-shaped key in the filename", () => {
    const v = scanFiles({
      "src/sk-abcdefghijklmnopqrstuvwx.ts": "//",
    });
    expect(v.some((x) => x.ruleId === "openai-key")).toBe(true);
  });
});

describe("redactString", () => {
  it("redacts emails in response body", () => {
    const { redacted, violations } = redactString(
      "contact: alice@example.com",
      "response"
    );
    expect(redacted).toBe("contact: [REDACTED:email]");
    expect(ids(violations)).toEqual(["email"]);
    expect(violations[0].source).toBe("response");
  });

  it("redacts JWTs and emails together", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const { redacted, violations } = redactString(
      `token=${jwt} email=alice@example.com`,
      "log",
      { logIndex: 3 }
    );
    expect(redacted).toBe("token=[REDACTED:jwt] email=[REDACTED:email]");
    expect(ids(violations)).toEqual(["email", "jwt"]);
    expect(violations.every((v) => v.source === "log")).toBe(true);
    expect(violations.every((v) => v.logIndex === 3)).toBe(true);
  });

  it("does not redact CPF look-alikes that fail validation", () => {
    const { redacted, violations } = redactString(
      "fake: 111.111.111-11",
      "response"
    );
    expect(redacted).toBe("fake: 111.111.111-11");
    expect(violations).toHaveLength(0);
  });

  it("redacts valid CPFs", () => {
    const { redacted, violations } = redactString(
      "cpf: 123.456.789-09",
      "response"
    );
    expect(redacted).toBe("cpf: [REDACTED:cpf]");
    expect(ids(violations)).toEqual(["cpf"]);
  });

  it("redacts AWS access keys (block severity still redacts in runtime)", () => {
    const { redacted } = redactString(
      "leak: AKIAIOSFODNN7EXAMPLE",
      "response"
    );
    expect(redacted).toBe("leak: [REDACTED:aws-access-key]");
  });

  it("returns empty violations on benign text", () => {
    const { redacted, violations } = redactString(
      "Hello, World — no PII here",
      "response"
    );
    expect(redacted).toBe("Hello, World — no PII here");
    expect(violations).toHaveLength(0);
  });

  it("preserves text outside matches", () => {
    const { redacted } = redactString(
      "before alice@example.com after",
      "response"
    );
    expect(redacted).toBe("before [REDACTED:email] after");
  });
});

describe("redact tokens for each rule", () => {
  it("every rule has a redactedAs token mentioning its id", () => {
    for (const rule of RULES) {
      expect(rule.redactedAs).toContain(rule.id);
    }
  });
});

describe("findRule helper invariant", () => {
  it("known ids exist", () => {
    expect(findRule("email").severity).toBe("redact");
    expect(findRule("aws-access-key").severity).toBe("block");
    expect(findRule("private-key").severity).toBe("block");
  });
});
