import { ArrowUpRight, ExternalLink, Mail, ShoppingCart } from "lucide-react";
import { useState } from "react";
import type { SiteEntry } from "@shared/types";
import { useTabData } from "./Generic";
import { api } from "../api";
import { TabHeader } from "../components/TabHeader";
import type { Dict } from "../i18n";

interface SiteTile {
  id: string;
  name: string;
  url: string;
  tag: string;
  group: "cheats" | "mail";
}

const SITES: SiteTile[] = [
  { id: "xone", name: "Xone", url: "https://xone.fun", tag: "store", group: "cheats" },
  { id: "midnight", name: "Midnight", url: "https://midnight.im", tag: "cheat", group: "cheats" },
  { id: "neverlose", name: "Neverlose", url: "https://neverlose.cc", tag: "cheat", group: "cheats" },
  { id: "selectplace", name: "Select-Place", url: "https://select-place.ru", tag: "store", group: "cheats" },
  { id: "memesense", name: "Memesense", url: "https://memesense.gg", tag: "cheat", group: "cheats" },
  { id: "nixware", name: "Nixware", url: "https://nixware.cc", tag: "cheat", group: "cheats" },
  { id: "fatality", name: "Fatality", url: "https://fatality.win", tag: "cheat", group: "cheats" },
  { id: "digiseller", name: "Digiseller", url: "https://digiseller.com", tag: "market", group: "cheats" },
  { id: "unknowncheats", name: "UnknownCheats", url: "https://unknowncheats.me", tag: "forum", group: "cheats" },
  { id: "gmail", name: "Gmail", url: "https://mail.google.com", tag: "mail", group: "mail" },
  { id: "ytstudio", name: "YouTube Studio", url: "https://studio.youtube.com", tag: "account", group: "mail" },
];

export default function SitesTab({ t }: { t: Dict }) {
  const { data, running, error } = useTabData<SiteEntry>(() => api().getSites(), true);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const open = async (urls: string[]) => {
    setOpening(true);
    setOpenError("");
    try {
      for (const url of urls) {
        if (!(await api().openExternal(url)).ok) throw Error();
      }
    } catch { setOpenError(t.actionFailed); }
    finally { setOpening(false); }
  };

  const group = (id: SiteTile["group"]) => SITES.filter((s) => s.group === id);

  return (
    <div className="space-y-5 animate-fade-up">
      <TabHeader
        tab="sites"
        t={t}
        actions={
          <button
            disabled={opening}
            onClick={() => void open(SITES.map(s => s.url))}
            className="flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-[12px] font-bold text-white shadow-accent-glow transition-all hover:bg-red-700"
          >
            <ExternalLink size={14} />
            {t.sitesOpenAll}
          </button>
        }
      />

      {openError && <p role="alert" className="text-[12px] text-red-300">{openError}</p>}
      <section className="overflow-hidden rounded-lg border border-edge bg-panel">
        <div className="border-b border-edge px-4 py-3 text-[12px] font-semibold text-white">{t.detect.browserTraces} · {data?.length ?? "…"}</div>
        {error && <p role="alert" className="p-4 text-[12px] text-red-300">{error}</p>}
        {data?.length ? <div className="max-h-[230px] overflow-auto"><table className="w-full text-left text-[11px]">
          <thead><tr className="text-faint"><th className="px-4 py-2">{t.table.name}</th><th className="px-4 py-2">{t.table.source}</th><th className="px-4 py-2">{t.table.path}</th></tr></thead>
          <tbody>{data.map((item) => <tr key={item.id} className="border-t border-edge/50"><td className="px-4 py-2 font-mono text-amber-300">{item.domain}</td><td className="px-4 py-2 text-muted">{item.browser} · {item.category}</td><td className="px-4 py-2 text-faint">{item.profile}</td></tr>)}</tbody>
        </table></div> : <p className="p-4 text-[12px] text-faint">{running ? t.scanning : t.empty.generic.title}</p>}
      </section>
      {(["cheats", "mail"] as const).map((g) => (
        <section key={g}>
          <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-faint">{t.sitesGroups[g]}</div>
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {group(g).map((s) => (
              <button
                key={s.id}
                disabled={opening}
                onClick={() => void open([s.url])}
                className="group flex h-10 items-center justify-between rounded-lg border border-edge bg-panel px-4 text-left transition-colors hover:border-accent/50"
              >
                <div>
                  <div className="flex items-center gap-2">
                    {g === "mail" ? <Mail size={14} className="text-muted" /> : <ShoppingCart size={14} className="text-muted" />}
                    <span className="text-[13.5px] font-bold text-white">{s.name}</span>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-faint transition-colors group-hover:text-red-400" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
