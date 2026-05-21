import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";

// Floating compliance chip used on the Playground route, where the full
// ComplianceFooter would interfere with the IDE-like layout.
export default function ComplianceChip() {
	const { t } = useTranslation();
	return (
		<div className="lgpd-chip" aria-label={t("footer.label")}>
			<LanguageSwitcher />
			<Link to="/privacy">{t("footer.privacy")}</Link>
			<Link to="/data-rights">{t("footer.dataRights")}</Link>
			<Link to="/manage-consent">{t("footer.manageConsent")}</Link>
		</div>
	);
}
