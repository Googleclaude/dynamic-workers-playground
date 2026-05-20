import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useConsent } from "./ConsentContext";

export default function ConsentBanner() {
	const { needsConsent, acceptAll, rejectAll, update } = useConsent();
	const { t } = useTranslation("banner");
	const [customizing, setCustomizing] = useState(false);
	const [functional, setFunctional] = useState(false);
	const [preferences, setPreferences] = useState(false);

	if (!needsConsent) return null;

	return (
		<div
			role="dialog"
			aria-modal="false"
			aria-labelledby="lgpd-banner-title"
			className="lgpd-banner"
		>
			<div className="lgpd-banner-content">
				<h2 id="lgpd-banner-title" className="lgpd-banner-title">
					{t("title")}
				</h2>
				<p className="lgpd-banner-description">
					<Trans i18nKey="description" ns="banner">
						This playground stores your theme and language preferences in your
						browser only when you allow it. The source code and GitHub URLs you
						submit are processed in memory to execute your Worker. Learn more
						in our <Link to="/privacy">Privacy Policy</Link>.
					</Trans>
				</p>

				{customizing && (
					<fieldset className="lgpd-banner-categories">
						<label className="lgpd-banner-cat">
							<input type="checkbox" checked disabled />
							<span>
								<strong>{t("categories.necessary.label")}</strong> —{" "}
								{t("categories.necessary.description")} (
								{t("categories.necessary.alwaysOn")})
							</span>
						</label>
						<label className="lgpd-banner-cat">
							<input
								type="checkbox"
								checked={functional}
								onChange={(e) => setFunctional(e.target.checked)}
							/>
							<span>
								<strong>{t("categories.functional.label")}</strong> —{" "}
								{t("categories.functional.description")}
							</span>
						</label>
						<label className="lgpd-banner-cat">
							<input
								type="checkbox"
								checked={preferences}
								onChange={(e) => setPreferences(e.target.checked)}
							/>
							<span>
								<strong>{t("categories.preferences.label")}</strong> —{" "}
								{t("categories.preferences.description")}
							</span>
						</label>
					</fieldset>
				)}

				<div className="lgpd-banner-actions">
					{customizing ? (
						<button
							type="button"
							className="lgpd-btn lgpd-btn-primary"
							onClick={() => update({ functional, preferences })}
						>
							{t("savePreferences")}
						</button>
					) : (
						<>
							<button
								type="button"
								className="lgpd-btn lgpd-btn-primary"
								onClick={acceptAll}
							>
								{t("acceptAll")}
							</button>
							<button
								type="button"
								className="lgpd-btn"
								onClick={rejectAll}
							>
								{t("rejectAll")}
							</button>
							<button
								type="button"
								className="lgpd-btn"
								onClick={() => setCustomizing(true)}
							>
								{t("customize")}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
