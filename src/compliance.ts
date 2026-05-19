export type Severity = "block" | "redact";

export type ViolationSource = "file" | "response" | "log";

export interface ComplianceRule {
  id: string;
  label: string;
  severity: Severity;
  pattern: RegExp;
  redactedAs: string;
  validate?: (match: string) => boolean;
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

function isValidCpf(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const nums = digits.split("").map((d) => Number.parseInt(d, 10));
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += nums[i] * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== nums[9]) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += nums[i] * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === nums[10];
}

function passesLuhn(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number.parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export const RULES: ComplianceRule[] = [
  {
    id: "aws-access-key",
    label: "AWS access key ID",
    severity: "block",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
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
    pattern: /(?<![A-Za-z0-9_-])sk-(?:proj-)?[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g,
    redactedAs: "[REDACTED:openai-key]",
  },
  {
    id: "github-token",
    label: "GitHub token",
    severity: "block",
    pattern:
      /(?<![A-Za-z0-9_])(?:ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{20,}(?![A-Za-z0-9_])/g,
    redactedAs: "[REDACTED:github-token]",
  },
  {
    id: "slack-token",
    label: "Slack token",
    severity: "block",
    pattern: /(?<![A-Za-z0-9-])xox[abprs]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9-])/g,
    redactedAs: "[REDACTED:slack-token]",
  },
  {
    id: "jwt",
    label: "JSON Web Token",
    severity: "redact",
    pattern:
      /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?![A-Za-z0-9_-])/g,
    redactedAs: "[REDACTED:jwt]",
  },
  {
    id: "email",
    label: "Email address",
    severity: "redact",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}(?![A-Za-z])/g,
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
    validate: isValidCpf,
  },
  {
    id: "credit-card",
    label: "Credit card number",
    severity: "redact",
    pattern: /\b(?:4\d{12}(?:\d{3})?|5[1-5]\d{14}|3[47]\d{13})\b/g,
    redactedAs: "[REDACTED:credit-card]",
    validate: passesLuhn,
  },
];

function freshPattern(rule: ComplianceRule): RegExp {
  return new RegExp(rule.pattern.source, rule.pattern.flags);
}

function buildPreview(snippet: string, rule: ComplianceRule): string {
  const redacted = snippet.replace(freshPattern(rule), rule.redactedAs);
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
    for (const rule of RULES) {
      for (const match of file.matchAll(freshPattern(rule))) {
        if (rule.validate && !rule.validate(match[0])) continue;
        violations.push({
          ruleId: rule.id,
          ruleLabel: rule.label,
          severity: rule.severity,
          source: "file",
          file,
          preview: buildPreview(file, rule),
        });
      }
    }

    if (typeof contents !== "string" || contents.length === 0) continue;

    for (const rule of RULES) {
      for (const match of contents.matchAll(freshPattern(rule))) {
        if (rule.validate && !rule.validate(match[0])) continue;
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
    const matches = [...redacted.matchAll(freshPattern(rule))];
    const kept = rule.validate
      ? matches.filter((m) => rule.validate!(m[0]))
      : matches;
    if (kept.length === 0) continue;

    for (const match of kept) {
      const previewSource = match[0].length > 160 ? `${match[0].slice(0, 80)}...` : match[0];
      violations.push({
        ruleId: rule.id,
        ruleLabel: rule.label,
        severity: rule.severity,
        source,
        logIndex: context?.logIndex,
        preview: previewSource.replace(freshPattern(rule), rule.redactedAs),
      });
    }

    redacted = redacted.replace(freshPattern(rule), (match) => {
      if (rule.validate && !rule.validate(match)) return match;
      return rule.redactedAs;
    });
  }

  return { redacted, violations };
}
