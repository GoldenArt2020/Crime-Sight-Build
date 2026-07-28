import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  Compass,
  FileSearch,
  Wand2,
  Search,
  Image as ImageIcon,
  BarChart3,
  Link2,
  Send,
  Radar,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/discover", label: "Discover Cases", icon: Compass },
  { to: "/case-intelligence", label: "Case Intelligence", icon: FileSearch },
  { to: "/angle-generator", label: "YouTube Angle Generator", icon: Wand2 },
  { to: "/seo-studio", label: "SEO Studio", icon: Search },
  { to: "/thumbnail-studio", label: "Thumbnail Studio", icon: ImageIcon },
  { to: "/competition-analyzer", label: "Competition Analyzer", icon: BarChart3 },
  { to: "/channel-matchmaker", label: "Channel Matchmaker", icon: Link2 },
  { to: "/publishing-center", label: "Publishing Center", icon: Send },
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-slate-950/80 border-r border-white/10 flex flex-col">
      <div className="px-5 py-6 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 flex items-center justify-center shrink-0">
          <Radar size={16} className="text-slate-950" strokeWidth={2.5} />
        </div>
        <span className="text-white font-semibold text-[15px] tracking-tight">
          Crime<span className="text-cyan-400">Sight</span>
        </span>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-white/10 text-white border border-cyan-400/30"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent",
              ].join(" ")
            }
          >
            <Icon size={16} className="shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-white/10 flex items-center gap-2 text-white/30 text-xs">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500" />
        CrimeSight
      </div>
    </aside>
  );
}