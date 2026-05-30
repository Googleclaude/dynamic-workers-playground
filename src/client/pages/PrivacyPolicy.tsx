import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
	CONTROLLER_INFO,
	DPO_INFO,
	POLICY_LAST_UPDATED,
} from "../lgpd/constants";

const SECTION_IDS = [
	"controller",
	"dpo",
	"data-collected",
	"legal-basis",
	"sharing",
	"international-transfer",
	"retention",
	"subject-rights",
	"cookies",
	"security",
	"updates",
	"contact",
] as const;

type SectionId = (typeof SECTION_IDS)[number];

interface SectionContent {
	title: string;
	body?: string[];
	items?: string[];
}

function readSection(
	t: (key: string, options?: Record<string, unknown>) => unknown,
	id: SectionId,
	values: Record<string, string>,
): SectionContent {
	const title = t(`sections.${id}.title`, values) as string;
	const body = t(`sections.${id}.body`, {
		...values,
		returnObjects: true,
		defaultValue: undefined,
	}) as string[] | undefined;
	const items = t(`sections.${id}.items`, {
		...values,
		returnObjects: true,
		defaultValue: undefined,
	}) as string[] | undefined;
	return {
		title,
		body: Array.isArray(body) ? body : undefined,
		items: Array.isArray(items) ? items : undefined,
	};
}

function renderParagraph(id: SectionId, idx: number, text: string) {
	if (id === "subject-rights" && /<1>/.test(text)) {
		return (
			<p key={idx}>
				<Trans
					i18nKey={`sections.subject-rights.body.${idx}`}
					ns="privacy"
					components={{ 1: <Link to="/data-rights" /> }}
				/>
			</p>
		);
	}
	if (id === "contact" && /<1>/.test(text)) {
		return (
			<p key={idx}>
				<Trans
					i18nKey={`sections.contact.body.${idx}`}
					ns="privacy"
					components={{ 1: <Link to="/data-rights" /> }}
				/>
			</p>
		);
	}
	return <p key={idx}>{text}</p>;
}

export default function PrivacyPolicy() {
	const { t } = useTranslation("privacy");
	const values = {
		legalName: CONTROLLER_INFO.legalName,
		cnpj: CONTROLLER_INFO.cnpj,
		address: CONTROLLER_INFO.address,
		email: CONTROLLER_INFO.email,
		name: DPO_INFO.name,
		dpoEmail: DPO_INFO.email,
		date: POLICY_LAST_UPDATED,
	};

	return (
		<article className="lgpd-page lgpd-privacy">
			<h1>{t("title")}</h1>
			<p className="lgpd-meta">{t("lastUpdated", { date: POLICY_LAST_UPDATED })}</p>
			<p>{t("intro")}</p>

			<nav aria-label={t("toc")} className="lgpd-toc">
				<h2>{t("toc")}</h2>
				<ol>
					{SECTION_IDS.map((id) => (
						<li key={id}>
							<a href={`#secao-${id}`}>
								{t(`sections.${id}.title`)}
							</a>
						</li>
					))}
				</ol>
			</nav>

			{SECTION_IDS.map((id) => {
				const section = readSection(t as never, id, {
					...values,
					email:
						id === "dpo"
							? DPO_INFO.email
							: id === "controller"
								? CONTROLLER_INFO.email
								: CONTROLLER_INFO.email,
					address: id === "dpo" ? DPO_INFO.address : CONTROLLER_INFO.address,
				});
				return (
					<section key={id} id={`secao-${id}`} className="lgpd-section">
						<h2>{section.title}</h2>
						{section.body?.map((line, idx) => renderParagraph(id, idx, line))}
						{section.items && (
							<ul>
								{section.items.map((item, idx) => (
									<li key={idx}>{item}</li>
								))}
							</ul>
						)}
					</section>
				);
			})}
		</article>
	);
}
