import type { CustomDetector } from "i18next-browser-languagedetector";
import { loadConsent } from "../lgpd/consentStorage";

const STORAGE_KEY = "i18nextLng";

export const customFunctionalStorage: CustomDetector = {
	name: "customFunctionalStorage",
	lookup() {
		if (typeof window === "undefined") return undefined;
		const consent = loadConsent();
		if (!consent || !consent.categories.functional) return undefined;
		return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
	},
	cacheUserLanguage(lng: string) {
		if (typeof window === "undefined") return;
		const consent = loadConsent();
		if (!consent || !consent.categories.functional) return;
		window.localStorage.setItem(STORAGE_KEY, lng);
	},
};
