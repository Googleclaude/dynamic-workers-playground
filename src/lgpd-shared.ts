// Shared between server (src/lgpd.ts) and client (src/client/lgpd/*).
// Single source of truth for the set of LGPD Art. 18 rights request types.
// Drift between client (the typed picker) and server (the validator) would
// either allow invalid requests or silently reject valid ones.

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

export const RIGHTS_REQUEST_TYPES_SET: ReadonlySet<string> = new Set(
	RIGHTS_REQUEST_TYPES,
);
