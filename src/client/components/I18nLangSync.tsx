import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function I18nLangSync() {
	const { i18n } = useTranslation();
	useEffect(() => {
		const set = () => {
			document.documentElement.lang = i18n.language;
		};
		set();
		i18n.on("languageChanged", set);
		return () => {
			i18n.off("languageChanged", set);
		};
	}, [i18n]);
	return null;
}
