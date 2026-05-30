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

// L-05 audit fix: detect unfilled placeholders so the rights UI can refuse
// to render. Shipping a public deployment with bracketed placeholders gives
// users a non-functional channel — worse than not exposing the UI at all,
// since LGPD art. 18 §1º requires a meaningful response channel.
function looksLikePlaceholder(value: string): boolean {
	return /^\s*\[.*\]\s*$/.test(value) || /example\.com$/.test(value);
}

export function hasValidControllerInfo(): boolean {
	return (
		!looksLikePlaceholder(CONTROLLER_INFO.legalName) &&
		!looksLikePlaceholder(CONTROLLER_INFO.cnpj) &&
		!looksLikePlaceholder(CONTROLLER_INFO.address) &&
		!looksLikePlaceholder(CONTROLLER_INFO.email) &&
		!looksLikePlaceholder(DPO_INFO.name) &&
		!looksLikePlaceholder(DPO_INFO.email) &&
		!looksLikePlaceholder(DPO_INFO.address)
	);
}

export const POLICY_LAST_UPDATED = "2026-05-07";

export const SUPPORTED_LANGUAGES = ["en", "pt-BR"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Re-exported from the shared module so the typed picker (client) and
// the validator (server) cannot drift. Single source of truth lives in
// src/lgpd-shared.ts.
export { RIGHTS_REQUEST_TYPES } from "../../lgpd-shared";
export type { RightsRequestType } from "../../lgpd-shared";
