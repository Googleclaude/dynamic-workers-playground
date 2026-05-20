import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { ReactNode } from "react";
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
	locale: string,
): ConsentRecord {
	return {
		version: CONSENT_VERSION,
		timestamp: new Date().toISOString(),
		locale,
		categories: { ...categories, necessary: true },
		method,
		id: newConsentId(),
	};
}

export function ConsentProvider({
	children,
	currentLocale = "en",
}: {
	children: ReactNode;
	currentLocale?: string;
}) {
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

	useEffect(() => {
		if (!record) return;
		if (!record.categories.functional) {
			window.localStorage.removeItem("theme");
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
			currentLocale,
		);
		saveConsent(next);
		setRecord(next);
	}, [currentLocale]);

	const rejectAll = useCallback(() => {
		const next = buildRecord(
			{ necessary: true, functional: false, preferences: false },
			"reject-all",
			currentLocale,
		);
		saveConsent(next);
		setRecord(next);
	}, [currentLocale]);

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
				currentLocale,
			);
			saveConsent(next);
			setRecord(next);
		},
		[record, currentLocale],
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
