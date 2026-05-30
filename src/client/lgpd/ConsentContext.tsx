import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { ReactNode } from "react";
import i18n from "../i18n";
import { CONSENT_VERSION } from "./constants";
import {
	CONSENT_CHANGED_EVENT,
	clearConsent,
	loadConsent,
	newConsentId,
	saveConsent,
} from "./consentStorage";
import type { ConsentCategory, ConsentRecord } from "./consentStorage";

interface ConsentContextValue {
	ready: boolean;
	record: ConsentRecord | null;
	needsConsent: boolean;
	has(c: ConsentCategory): boolean;
	acceptAll(): void;
	rejectAll(): void;
	update(categories: Partial<Record<ConsentCategory, boolean>>): void;
	revoke(): void;
}

const defaultValue: ConsentContextValue = {
	ready: false,
	record: null,
	needsConsent: true,
	has: () => false,
	acceptAll: () => undefined,
	rejectAll: () => undefined,
	update: () => undefined,
	revoke: () => undefined,
};

const ConsentContext = createContext<ConsentContextValue>(defaultValue);

function buildRecord(
	categories: Record<ConsentCategory, boolean>,
	method: ConsentRecord["method"],
): ConsentRecord {
	return {
		version: CONSENT_VERSION,
		timestamp: new Date().toISOString(),
		locale: i18n.language || i18n.resolvedLanguage || "en",
		categories: { ...categories, necessary: true },
		method,
		id: newConsentId(),
	};
}

export function ConsentProvider({ children }: { children: ReactNode }) {
	const [record, setRecord] = useState<ConsentRecord | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setRecord(loadConsent());
		setReady(true);
		const onChange = () => setRecord(loadConsent());
		window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
		window.addEventListener("storage", onChange);
		return () => {
			window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
			window.removeEventListener("storage", onChange);
		};
	}, []);

	// `theme` cleanup is owned by useDarkMode (single writer). Here we only
	// purge i18nextLng on revocation — the i18n detector reads but doesn't
	// expose a revoke hook, so a stale key would otherwise leak.
	useEffect(() => {
		if (!record) return;
		if (!record.categories.functional) {
			window.localStorage.removeItem("i18nextLng");
		}
	}, [record]);

	const has = useCallback(
		(c: ConsentCategory) =>
			Boolean(record && record.categories && record.categories[c]),
		[record],
	);

	const acceptAll = useCallback(() => {
		const next = buildRecord(
			{ necessary: true, functional: true, preferences: true },
			"accept-all",
		);
		saveConsent(next);
		setRecord(next);
	}, []);

	const rejectAll = useCallback(() => {
		const next = buildRecord(
			{ necessary: true, functional: false, preferences: false },
			"reject-all",
		);
		saveConsent(next);
		setRecord(next);
	}, []);

	const update = useCallback(
		(categories: Partial<Record<ConsentCategory, boolean>>) => {
			const base = record?.categories ?? {
				necessary: true,
				functional: false,
				preferences: false,
			};
			const next = buildRecord(
				{
					necessary: true,
					functional: categories.functional ?? base.functional,
					preferences: categories.preferences ?? base.preferences,
				},
				"custom",
			);
			saveConsent(next);
			setRecord(next);
		},
		[record],
	);

	const revoke = useCallback(() => {
		clearConsent();
		setRecord(null);
	}, []);

	const value = useMemo<ConsentContextValue>(
		() => ({
			ready,
			record,
			needsConsent: ready && !record,
			has,
			acceptAll,
			rejectAll,
			update,
			revoke,
		}),
		[ready, record, has, acceptAll, rejectAll, update, revoke],
	);

	return (
		<ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
	);
}

export function useConsent() {
	return useContext(ConsentContext);
}
