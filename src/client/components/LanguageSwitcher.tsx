import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../lgpd/constants";

export default function LanguageSwitcher() {
	const { i18n, t } = useTranslation();
	return (
		<label className="lgpd-language-switcher">
			<span className="lgpd-visually-hidden">{t("language.label")}</span>
			<select
				value={i18n.resolvedLanguage ?? i18n.language}
				onChange={(e) => {
					void i18n.changeLanguage(e.target.value);
				}}
				aria-label={t("language.label")}
			>
				{SUPPORTED_LANGUAGES.map((lng) => (
					<option key={lng} value={lng}>
						{t(`language.${lng}`)}
					</option>
				))}
			</select>
		</label>
	);
}
