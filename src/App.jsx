import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "../components/Sidebar";

import Dashboard from "./Dashboard";
import DiscoverCases from "./DiscoverCases";
import CaseIntelligence from "./CaseIntelligence";
import AngleGenerator from "./AngleGenerator";
import SeoStudio from "./SeoStudio";
import ThumbnailStudio from "./ThumbnailStudio";
import CompetitionAnalyzer from "./CompetitionAnalyzer";
import ChannelMatchmaker from "./ChannelMatchmaker";
import PublishingCenter from "./PublishingCenter";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex bg-slate-950 min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/discover" element={<DiscoverCases />} />
            <Route path="/case-intelligence" element={<CaseIntelligence />} />
            <Route path="/angle-generator" element={<AngleGenerator />} />
            <Route path="/seo-studio" element={<SeoStudio />} />
            <Route path="/thumbnail-studio" element={<ThumbnailStudio />} />
            <Route path="/competition-analyzer" element={<CompetitionAnalyzer />} />
            <Route path="/channel-matchmaker" element={<ChannelMatchmaker />} />
            <Route path="/publishing-center" element={<PublishingCenter />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}