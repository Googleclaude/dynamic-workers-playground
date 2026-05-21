// LGPD compliance constants. The CONSENT_VERSION literal is also hard-coded
// in index.html (pre-hydration script) and must be kept in sync.
export const CONSENT_VERSION = "1.0.0";
export const CONSENT_KEY = "lgpd-consent";

export const CONTROLLER_INFO = {
	legalName: "[Razão Social do Controlador]",
	cnpj: "[CNPJ]",
	address: "[Endereço Postal]",
	email: "contato@example.com",
};

export const DPO_INFO = {
	name: "[Nome do Encarregado / DPO]",
	email: "dpo@example.com",
	address: "[Endereço Postal do DPO]",
};

export const POLICY_LAST_UPDATED = "2026-05-07";

export const SUPPORTED_LANGUAGES = ["en", "pt-BR"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const RIGHTS_REQUEST_TYPES = [
	"confirmation",
	"access",
	"correction",
	"anonymization-blocking-deletion",
	"portability",
	"sharing-info",
	"refusal-consequences",
	"consent-revocation",
	"opposition",
] as const;
export type RightsRequestType = (typeof RIGHTS_REQUEST_TYPES)[number];
