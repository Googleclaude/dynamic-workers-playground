import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../lgpd/constants";
import { customFunctionalStorage } from "./customFunctionalStorage";

import enCommon from "./locales/en/common.json";
import enBanner from "./locales/en/banner.json";
import enPrivacy from "./locales/en/privacy.json";
import enRights from "./locales/en/rights.json";
import enConsent from "./locales/en/consent.json";

import ptCommon from "./locales/pt-BR/common.json";
import ptBanner from "./locales/pt-BR/banner.json";
import ptPrivacy from "./locales/pt-BR/privacy.json";
import ptRights from "./locales/pt-BR/rights.json";
import ptConsent from "./locales/pt-BR/consent.json";

const detector = new LanguageDetector();
detector.addDetector(customFunctionalStorage);

void i18n
	.use(detector)
	.use(initReactI18next)
	.init({
		resources: {
			en: {
				common: enCommon,
				banner: enBanner,
				privacy: enPrivacy,
				rights: enRights,
				consent: enConsent,
			},
			"pt-BR": {
				common: ptCommon,
				banner: ptBanner,
				privacy: ptPrivacy,
				rights: ptRights,
				consent: ptConsent,
			},
		},
		fallbackLng: "en",
		supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
		nonExplicitSupportedLngs: false,
		ns: ["common", "banner", "privacy", "rights", "consent"],
		defaultNS: "common",
		detection: {
			order: ["customFunctionalStorage", "navigator", "htmlTag"],
			caches: ["customFunctionalStorage"],
		},
		interpolation: { escapeValue: false },
		returnObjects: false,
	});

export default i18n;
