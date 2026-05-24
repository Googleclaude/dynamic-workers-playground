import { useEffect, useState } from "react";
import { useTranslation } from "../i18n";
import { Link } from "../router";
import { useConsent } from "../lgpd/ConsentContext";

export default function ManageConsent() {
	const { record, update, revoke } = useConsent();
	const { t } = useTranslation("consent");
	const { t: tc } = useTranslation();

	const [functional, setFunctional] = useState(false);
	const [preferences, setPreferences] = useState(false);
	const [savedAt, setSavedAt] = useState<string | null>(null);

	useEffect(() => {
		if (record) {
			setFunctional(record.categories.functional);
			setPreferences(record.categories.preferences);
		} else {
			setFunctional(false);
			setPreferences(false);
		}
	}, [record]);

	function onSave() {
		update({ functional, preferences });
		setSavedAt(new Date().toISOString());
	}

	function onRevoke() {
		if (window.confirm(t("revokeConfirm"))) {
			revoke();
			setSavedAt(null);
		}
	}

	return (
		<article className="lgpd-page lgpd-manage-consent">
			<h1>{t("title")}</h1>
			<p>{t("intro")}</p>

			{record ? (
				<dl className="lgpd-record">
					<dt>{t("recordedAt")}</dt>
					<dd>{new Date(record.timestamp).toLocaleString()}</dd>
					<dt>{t("method.label")}</dt>
					<dd>{t(`method.${record.method}`)}</dd>
				</dl>
			) : (
				<p className="lgpd-meta">{t("noRecord")}</p>
			)}

			<fieldset className="lgpd-banner-categories">
				<legend>{t("currentChoices")}</legend>
				<label className="lgpd-banner-cat">
					<input type="checkbox" checked disabled />
					<span>
						<strong>Necessary</strong>
					</span>
				</label>
				<label className="lgpd-banner-cat">
					<input
						type="checkbox"
						checked={functional}
						onChange={(e) => setFunctional(e.target.checked)}
					/>
					<span>
						<strong>Functional</strong>
					</span>
				</label>
				<label className="lgpd-banner-cat">
					<input
						type="checkbox"
						checked={preferences}
						onChange={(e) => setPreferences(e.target.checked)}
					/>
					<span>
						<strong>Preferences</strong>
					</span>
				</label>
			</fieldset>

			{savedAt && (
				<p role="status" className="lgpd-meta">
					{t("saved")} ({new Date(savedAt).toLocaleTimeString()})
				</p>
			)}

			<div className="lgpd-actions">
				<button
					type="button"
					className="lgpd-btn lgpd-btn-primary"
					onClick={onSave}
				>
					{t("save")}
				</button>
				<button type="button" className="lgpd-btn" onClick={onRevoke}>
					{t("revoke")}
				</button>
				<Link to="/" className="lgpd-link">
					{tc("common.back")}
				</Link>
			</div>
		</article>
	);
}
