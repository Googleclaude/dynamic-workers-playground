import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Playground } from "./index";
import I18nLangSync from "./components/I18nLangSync";
import ComplianceChip from "./components/ComplianceChip";
import ComplianceFooter from "./components/ComplianceFooter";
import ConsentBanner from "./lgpd/ConsentBanner";
import { ConsentProvider } from "./lgpd/ConsentContext";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DataRightsForm from "./pages/DataRightsForm";
import ManageConsent from "./pages/ManageConsent";

export default function Root() {
	return (
		<ConsentProvider>
			<I18nLangSync />
			<BrowserRouter>
				<Routes>
					<Route
						path="/"
						element={
							<>
								<Playground />
								<ComplianceChip />
							</>
						}
					/>
					<Route
						path="/privacy"
						element={
							<div className="lgpd-route-wrap">
								<PrivacyPolicy />
								<ComplianceFooter />
							</div>
						}
					/>
					<Route
						path="/data-rights"
						element={
							<div className="lgpd-route-wrap">
								<DataRightsForm />
								<ComplianceFooter />
							</div>
						}
					/>
					<Route
						path="/manage-consent"
						element={
							<div className="lgpd-route-wrap">
								<ManageConsent />
								<ComplianceFooter />
							</div>
						}
					/>
				</Routes>
				<ConsentBanner />
			</BrowserRouter>
		</ConsentProvider>
	);
}
