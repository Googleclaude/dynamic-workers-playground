import { I18nProvider } from "./i18n";
import { Router, useRouter } from "./router";
import { Playground } from "./index";
import ComplianceChip from "./components/ComplianceChip";
import ComplianceFooter from "./components/ComplianceFooter";
import ConsentBanner from "./lgpd/ConsentBanner";
import { ConsentProvider } from "./lgpd/ConsentContext";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DataRightsForm from "./pages/DataRightsForm";
import ManageConsent from "./pages/ManageConsent";

function Routes() {
	const { path } = useRouter();
	if (path === "/privacy")
		return (
			<div className="lgpd-route-wrap">
				<PrivacyPolicy />
				<ComplianceFooter />
			</div>
		);
	if (path === "/data-rights")
		return (
			<div className="lgpd-route-wrap">
				<DataRightsForm />
				<ComplianceFooter />
			</div>
		);
	if (path === "/manage-consent")
		return (
			<div className="lgpd-route-wrap">
				<ManageConsent />
				<ComplianceFooter />
			</div>
		);
	return (
		<>
			<Playground />
			<ComplianceChip />
		</>
	);
}

export default function Root() {
	return (
		<I18nProvider>
			<ConsentProvider>
				<Router>
					<Routes />
					<ConsentBanner />
				</Router>
			</ConsentProvider>
		</I18nProvider>
	);
}
