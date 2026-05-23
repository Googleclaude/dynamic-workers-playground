import { useState } from "react";
import { useTranslation } from "../i18n";
import { Link } from "../router";
import { RIGHTS_REQUEST_TYPES } from "../lgpd/constants";
import type { RightsRequestType } from "../lgpd/constants";
import { submitRightsRequest } from "../lgpd/api";
import type { RightsRequestResponse } from "../lgpd/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DETAILS = 2000;

export default function DataRightsForm() {
	const { t, lang } = useTranslation("rights");
	const { t: tc } = useTranslation();

	const [requestType, setRequestType] = useState<RightsRequestType>("access");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [cpf, setCpf] = useState("");
	const [details, setDetails] = useState("");
	const [confirm, setConfirm] = useState(false);

	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<RightsRequestResponse | null>(null);

	function reset() {
		setRequestType("access");
		setName("");
		setEmail("");
		setCpf("");
		setDetails("");
		setConfirm(false);
		setError(null);
		setResult(null);
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);

		if (!name.trim() || !email.trim() || !details.trim()) {
			setError(t("errors.required"));
			return;
		}
		if (!EMAIL_RE.test(email.trim())) {
			setError(t("errors.emailFormat"));
			return;
		}
		if (details.length > MAX_DETAILS) {
			setError(t("errors.detailsTooLong"));
			return;
		}
		if (!confirm) {
			setError(t("errors.confirmRequired"));
			return;
		}

		setSubmitting(true);
		try {
			const res = await submitRightsRequest({
				requestType,
				name,
				email,
				cpf: cpf.trim() || undefined,
				details,
				locale: lang,
				confirmedSubject: confirm,
			});
			setResult(res);
		} catch (err) {
			setError(
				err instanceof Error && err.message
					? err.message
					: t("errors.submitFailed"),
			);
		} finally {
			setSubmitting(false);
		}
	}

	if (result) {
		return (
			<article className="lgpd-page lgpd-rights">
				<h1>{t("success.title")}</h1>
				<p>{t("success.description")}</p>
				<p className="lgpd-protocol">
					<strong>{t("success.protocolLabel")}:</strong>{" "}
					<code>{result.protocol}</code>
				</p>
				<p>{t("success.sla")}</p>
				<div className="lgpd-actions">
					<button type="button" className="lgpd-btn" onClick={reset}>
						{t("success.newRequest")}
					</button>
					<Link to="/" className="lgpd-link">
						{tc("common.back")}
					</Link>
				</div>
			</article>
		);
	}

	return (
		<article className="lgpd-page lgpd-rights">
			<h1>{t("title")}</h1>
			<p>{t("intro")}</p>

			<form onSubmit={onSubmit} noValidate className="lgpd-form">
				<fieldset>
					<legend>{t("types.label")}</legend>
					{RIGHTS_REQUEST_TYPES.map((type) => (
						<label key={type} className="lgpd-radio">
							<input
								type="radio"
								name="requestType"
								value={type}
								checked={requestType === type}
								onChange={() => setRequestType(type)}
							/>
							<span>{t(`types.${type}`)}</span>
						</label>
					))}
				</fieldset>

				<label className="lgpd-field">
					<span>{t("fields.name")} *</span>
					<input
						type="text"
						required
						autoComplete="name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={t("fields.namePlaceholder")}
					/>
				</label>

				<label className="lgpd-field">
					<span>{t("fields.email")} *</span>
					<input
						type="email"
						required
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder={t("fields.emailPlaceholder")}
					/>
				</label>

				<label className="lgpd-field">
					<span>{t("fields.cpf")}</span>
					<input
						type="text"
						value={cpf}
						onChange={(e) => setCpf(e.target.value)}
						placeholder={t("fields.cpfPlaceholder")}
						inputMode="numeric"
					/>
					<small>{t("fields.cpfHelp")}</small>
				</label>

				<label className="lgpd-field">
					<span>{t("fields.details")} *</span>
					<textarea
						required
						maxLength={MAX_DETAILS}
						rows={6}
						value={details}
						onChange={(e) => setDetails(e.target.value)}
						placeholder={t("fields.detailsPlaceholder")}
					/>
					<small>
						{details.length} / {MAX_DETAILS}
					</small>
				</label>

				<label className="lgpd-checkbox">
					<input
						type="checkbox"
						checked={confirm}
						onChange={(e) => setConfirm(e.target.checked)}
					/>
					<span>{t("fields.confirmSubject")}</span>
				</label>

				{error && (
					<p role="alert" className="lgpd-error">
						{error}
					</p>
				)}

				<div className="lgpd-actions">
					<button
						type="submit"
						className="lgpd-btn lgpd-btn-primary"
						disabled={submitting}
					>
						{submitting ? t("fields.submitting") : t("fields.submit")}
					</button>
					<Link to="/" className="lgpd-link">
						{tc("common.cancel")}
					</Link>
				</div>
			</form>
		</article>
	);
}
