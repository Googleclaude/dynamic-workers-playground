import { useTranslation } from "../i18n";
import { SUPPORTED_LANGUAGES } from "../lgpd/constants";

export default function LanguageSwitcher() {
	const { t, lang, changeLang } = useTranslation();
	return (
		<label className="lgpd-language-switcher">
			<span className="lgpd-visually-hidden">{t("language.label")}</span>
			<select
				value={lang}
				onChange={(e) => {
					changeLang(e.target.value);
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
