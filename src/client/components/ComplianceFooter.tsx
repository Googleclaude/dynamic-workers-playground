import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";

export default function ComplianceFooter() {
	const { t } = useTranslation();
	return (
		<footer className="lgpd-footer" aria-label={t("footer.label")}>
			<nav className="lgpd-footer-nav">
				<Link to="/privacy">{t("footer.privacy")}</Link>
				<Link to="/data-rights">{t("footer.dataRights")}</Link>
				<Link to="/manage-consent">{t("footer.manageConsent")}</Link>
			</nav>
			<LanguageSwitcher />
		</footer>
	);
}
