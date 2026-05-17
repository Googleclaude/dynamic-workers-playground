export type Severity = "block" | "redact";

export type ViolationSource = "file" | "response" | "log";

export interface ComplianceRule {
  id: string;
  label: string;
  severity: Severity;
  pattern: RegExp;
  redactedAs: string;
}

export interface ComplianceViolation {
  ruleId: string;
  ruleLabel: string;
  severity: Severity;
  source: ViolationSource;
  file?: string;
  line?: number;
  logIndex?: number;
  preview: string;
}

export const RULES: ComplianceRule[] = [
  {
    id: "aws-access-key",
    label: "AWS access key ID",
    severity: "block",
    pattern: /AKIA[0-9A-Z]{16}/g,
    redactedAs: "[REDACTED:aws-access-key]",
  },
  {
    id: "private-key",
    label: "Private key block",
    severity: "block",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |)PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA |PGP |)PRIVATE KEY-----/g,
    redactedAs: "[REDACTED:private-key]",
  },
  {
    id: "openai-key",
    label: "OpenAI-style API key",
    severity: "block",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
    redactedAs: "[REDACTED:openai-key]",
  },
  {
    id: "github-token",
    label: "GitHub token",
    severity: "block",
    pattern: /\b(?:ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{20,}\b/g,
    redactedAs: "[REDACTED:github-token]",
  },
  {
    id: "slack-token",
    label: "Slack token",
    severity: "block",
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    redactedAs: "[REDACTED:slack-token]",
  },
  {
    id: "jwt",
    label: "JSON Web Token",
    severity: "redact",
    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    redactedAs: "[REDACTED:jwt]",
  },
  {
    id: "email",
    label: "Email address",
    severity: "redact",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    redactedAs: "[REDACTED:email]",
  },
  {
    id: "us-ssn",
    label: "US Social Security Number",
    severity: "redact",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    redactedAs: "[REDACTED:us-ssn]",
  },
  {
    id: "cpf",
    label: "Brazilian CPF",
    severity: "redact",
    pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    redactedAs: "[REDACTED:cpf]",
  },
  {
    id: "credit-card",
    label: "Credit card number",
    severity: "redact",
    pattern: /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13})\b/g,
    redactedAs: "[REDACTED:credit-card]",
  },
];

function buildPreview(snippet: string, rule: ComplianceRule): string {
  const redacted = snippet.replace(
    new RegExp(rule.pattern.source, rule.pattern.flags),
    rule.redactedAs
  );
  const trimmed = redacted.trim();
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157)}...`;
}

function lineNumberAt(contents: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < contents.length; i++) {
    if (contents.charCodeAt(i) === 10) line++;
  }
  return line;
}

export function scanFiles(files: Record<string, string>): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  for (const [file, contents] of Object.entries(files)) {
    if (typeof contents !== "string" || contents.length === 0) continue;

    for (const rule of RULES) {
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      for (const match of contents.matchAll(pattern)) {
        const index = match.index ?? 0;
        const line = lineNumberAt(contents, index);
        const sliceStart = Math.max(0, index - 40);
        const sliceEnd = Math.min(
          contents.length,
          index + match[0].length + 40
        );
        const snippet = contents.slice(sliceStart, sliceEnd).replace(/\n/g, " ");
        violations.push({
          ruleId: rule.id,
          ruleLabel: rule.label,
          severity: rule.severity,
          source: "file",
          file,
          line,
          preview: buildPreview(snippet, rule),
        });
      }
    }
  }

  return violations;
}

export function redactString(
  input: string,
  source: "response" | "log",
  context?: { logIndex?: number }
): { redacted: string; violations: ComplianceViolation[] } {
  let redacted = input;
  const violations: ComplianceViolation[] = [];

  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    const matches = redacted.match(pattern);
    if (!matches || matches.length === 0) continue;

    for (const match of matches) {
      const previewSource = match.length > 160 ? `${match.slice(0, 80)}...` : match;
      violations.push({
        ruleId: rule.id,
        ruleLabel: rule.label,
        severity: rule.severity,
        source,
        logIndex: context?.logIndex,
        preview: previewSource.replace(
          new RegExp(rule.pattern.source, rule.pattern.flags),
          rule.redactedAs
        ),
      });
    }

    redacted = redacted.replace(
      new RegExp(rule.pattern.source, rule.pattern.flags),
      rule.redactedAs
    );
  }

  return { redacted, violations };
}
