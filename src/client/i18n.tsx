import {
	cloneElement,
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactElement,
	type ReactNode,
} from "react";
import { loadConsent } from "./lgpd/consentStorage";
import { SUPPORTED_LANGUAGES } from "./lgpd/constants";

import enCommon from "./i18n/locales/en/common.json";
import enBanner from "./i18n/locales/en/banner.json";
import enPrivacy from "./i18n/locales/en/privacy.json";
import enRights from "./i18n/locales/en/rights.json";
import enConsent from "./i18n/locales/en/consent.json";

import ptCommon from "./i18n/locales/pt-BR/common.json";
import ptBanner from "./i18n/locales/pt-BR/banner.json";
import ptPrivacy from "./i18n/locales/pt-BR/privacy.json";
import ptRights from "./i18n/locales/pt-BR/rights.json";
import ptConsent from "./i18n/locales/pt-BR/consent.json";

// JSON imports lack index signatures — cast to allow dynamic key traversal
const LOCALES: Record<string, Record<string, Record<string, unknown>>> = {
	en: {
		common: enCommon as Record<string, unknown>,
		banner: enBanner as Record<string, unknown>,
		privacy: enPrivacy as Record<string, unknown>,
		rights: enRights as Record<string, unknown>,
		consent: enConsent as Record<string, unknown>,
	},
	"pt-BR": {
		common: ptCommon as Record<string, unknown>,
		banner: ptBanner as Record<string, unknown>,
		privacy: ptPrivacy as Record<string, unknown>,
		rights: ptRights as Record<string, unknown>,
		consent: ptConsent as Record<string, unknown>,
	},
};

const STORAGE_KEY = "i18nextLng";
const FALLBACK = "en";

// Module-level current language for synchronous reads outside React (ConsentContext)
let _currentLang = FALLBACK;
export function getLang(): string {
	return _currentLang;
}

function detectLang(): string {
	const consent = loadConsent();
	if (consent?.categories.functional) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored))
			return stored;
	}
	const nav = navigator.language;
	if ((SUPPORTED_LANGUAGES as readonly string[]).includes(nav)) return nav;
	const base = nav.split("-")[0];
	const match = (SUPPORTED_LANGUAGES as readonly string[]).find((l) =>
		l.startsWith(base),
	);
	return match ?? FALLBACK;
}

function getVal(obj: Record<string, unknown> | undefined, path: string): unknown {
	if (!obj) return undefined;
	return path.split(".").reduce((acc: unknown, k) => {
		if (acc != null && typeof acc === "object")
			return (acc as Record<string, unknown>)[k];
		return undefined;
	}, obj as unknown);
}

function interpolate(str: string, values: Record<string, string>): string {
	return str.replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? `{{${k}}}`);
}

export type TFunc = (key: string, opts?: Record<string, unknown>) => string;

function makeT(lang: string, ns: string): TFunc {
	const nsData = (LOCALES[lang] ?? LOCALES[FALLBACK])![ns];
	return (key, opts = {}) => {
		const { returnObjects, defaultValue, ...rest } = opts as {
			returnObjects?: boolean;
			defaultValue?: unknown;
		} & Record<string, string>;
		const raw = getVal(nsData, key);
		if (raw === undefined)
			return String(defaultValue !== undefined ? defaultValue : key);
		// When returnObjects is true the caller casts the result themselves
		if (returnObjects) return raw as unknown as string;
		if (typeof raw === "string") return interpolate(raw, rest);
		return String(raw);
	};
}

type I18nCtx = { lang: string; changeLang: (l: string) => void };
const I18nContext = createContext<I18nCtx>({
	lang: FALLBACK,
	changeLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
	const [lang, setLang] = useState<string>(detectLang);

	function changeLang(l: string) {
		setLang(l);
		_currentLang = l;
		document.documentElement.lang = l;
		const consent = loadConsent();
		if (consent?.categories.functional) {
			localStorage.setItem(STORAGE_KEY, l);
		}
	}

	useEffect(() => {
		_currentLang = lang;
		document.documentElement.lang = lang;
	}, [lang]);

	return (
		<I18nContext.Provider value={{ lang, changeLang }}>
			{children}
		</I18nContext.Provider>
	);
}

export function useTranslation(ns = "common") {
	const { lang, changeLang } = useContext(I18nContext);
	return { t: makeT(lang, ns), lang, changeLang };
}

export function Trans({
	i18nKey,
	ns = "common",
	components,
}: {
	i18nKey: string;
	ns?: string;
	components: Record<string | number, ReactElement>;
}) {
	const { lang } = useContext(I18nContext);
	const nsData = (LOCALES[lang] ?? LOCALES[FALLBACK])![ns];
	const raw = getVal(nsData, i18nKey);
	if (typeof raw !== "string") return null;

	const parts: ReactNode[] = [];
	const re = /<(\d+)>(.*?)<\/\1>/gs;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(raw)) !== null) {
		if (m.index > last) parts.push(raw.slice(last, m.index));
		const [, num, content] = m;
		const el = components[num] ?? components[parseInt(num, 10)];
		if (el) {
			parts.push(cloneElement(el, { key: m.index }, content));
		} else {
			parts.push(content);
		}
		last = re.lastIndex;
	}
	if (last < raw.length) parts.push(raw.slice(last));
	return <>{parts}</>;
}
