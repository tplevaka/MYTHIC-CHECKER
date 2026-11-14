import { FileSearch, FileWarning, Globe, HardDrive, History, LayoutGrid, MessageCircle, Package, Plug, ScanLine, Settings2, ShieldAlert } from "lucide-react";
import type { TabId } from "@shared/types";
import { api } from "../api";
import type { Dict, Lang } from "../i18n";
import logo from "../../assets/icon.png";

const DISCORD_URL = "https://discord.gg/du6cwVQhT";

const CHECK_TABS: { id: TabId; icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
  { id: "file-search", icon: FileSearch },
  { id: "usb-devices", icon: Plug },
  { id: "last-activity", icon: History },
  { id: "software", icon: Package },
  { id: "pc-registry", icon: HardDrive },
  { id: "steam-accounts", icon: LayoutGrid },
];

const ADDITIONAL_TABS: { id: TabId; icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
  { id: "traces", icon: ShieldAlert },
  { id: "processes", icon: ScanLine },
  { id: "renamed-files", icon: FileWarning },
  { id: "sites", icon: Globe },
  { id: "other", icon: Settings2 },
];

function NavItem({
  id,
  icon: Icon,
  active,
  label,
  onClick,
}: {
  id: TabId;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-2.5 rounded-md px-3 py-[7px] text-left text-[12.5px] font-medium transition-all ${
        active
          ? "bg-accent/10 text-white shadow-accent-glow"
          : "text-muted hover:bg-edge/60 hover:text-white"
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent shadow-[0_0_8px_#DC2626]" />}
      <Icon size={15} className={active ? "text-red-400" : "text-faint group-hover:text-muted"} />
      <span className="truncate">{label}</span>
    </button>
  );
}

interface Props {
  tab: TabId;
  setTab: (t: TabId) => void;
  lang: Lang;
  t: Dict;
}

export default function Sidebar({ tab, setTab, lang, t }: Props) {
  void lang;
  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-edge bg-panel">
      <div className="flex items-center gap-3 px-5 pb-5 pt-5">
        <img src={logo} alt="MYTHIC" className="h-10 w-10 object-contain drop-shadow-[0_0_10px_rgba(220,38,38,0.45)]" />
        <div className="leading-none">
          <div className="text-[17px] font-extrabold tracking-[0.18em] text-white">
            MYTHIC
          </div>
          <div className="mt-1 text-[9px] font-bold tracking-[0.42em] text-faint">{t.appSuffix}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        <div>
          <div className="mb-2 px-3 text-[9.5px] font-bold tracking-[0.28em] text-faint">{t.categoryCheck}</div>
          <div className="space-y-0.5">
            {CHECK_TABS.map((x) => (
              <NavItem key={x.id} id={x.id} icon={x.icon} active={tab === x.id} label={t.nav[x.id]} onClick={() => setTab(x.id)} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 px-3 text-[9.5px] font-bold tracking-[0.28em] text-faint">{t.categoryAdditional}</div>
          <div className="space-y-0.5">
            {ADDITIONAL_TABS.map((x) => (
              <NavItem key={x.id} id={x.id} icon={x.icon} active={tab === x.id} label={t.nav[x.id]} onClick={() => setTab(x.id)} />
            ))}
          </div>
        </div>
      </nav>

      <div className="border-t border-edge px-5 py-4">
        <div className="flex items-center gap-4 text-[11px] font-medium text-faint">
          <button
            onClick={() => setTab("sites")}
            className="flex items-center gap-1.5 transition-colors hover:text-white"
          >
            <Globe size={13} /> {t.footer.site}
          </button>
          <button
            onClick={() => void api().openExternal(DISCORD_URL)}
            className="flex items-center gap-1.5 transition-colors hover:text-white"
          >
            <MessageCircle size={13} /> {t.footer.discord}
          </button>
        </div>
      </div>
    </aside>
  );
}
