import { Bell, Globe, History, Loader2, Minus, RefreshCw, Settings, Square, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReportData, SiteEntry, TabId } from "@shared/types";
import { api } from "../api";
import type { Dict, Lang } from "../i18n";

type Panel = "notifications" | "settings" | "history";

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} className="no-drag relative grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-edge hover:text-white">{children}</button>;
}

export default function Titlebar({ lang, setLang, setTab, t }: { lang: Lang; setLang: (lang: Lang) => void; setTab: (tab: TabId) => void; t: Dict }) {
  const [sound, setSound] = useState(() => localStorage.getItem("mythic-sound") !== "false");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [sites, setSites] = useState<SiteEntry[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const a = api();

  useEffect(() => {
    localStorage.setItem("mythic-sound", String(sound));
    api().notifySound(sound);
  }, [sound]);

  useEffect(() => {
    if (!panel) return;
    const outside = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setPanel(null); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setPanel(null); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [panel]);

  const open = async (next: Panel) => {
    if (panel === next) { setPanel(null); return; }
    setPanel(next);
    setError("");
    setLoading(next !== "settings");
    try {
      if (next === "notifications") {
        const result = await a.getSites();
        setSites(result.items.filter(item => item.browser !== "system"));
        if (result.error) setError(result.error);
      }
      if (next === "history") setReport(await a.buildReport());
    } catch { setError(t.actionFailed); }
    finally { setLoading(false); }
  };

  const navigate = (tab: TabId) => { setPanel(null); setTab(tab); };
  const languageButtons = <div className="flex gap-1">{(["en", "uk"] as Lang[]).map(l => <button type="button" key={l} aria-pressed={lang === l} onClick={() => setLang(l)} className={`no-drag rounded px-2 py-1 text-[11px] font-bold uppercase ${lang === l ? "bg-accent text-white" : "text-muted hover:bg-edge hover:text-white"}`}>{l}</button>)}</div>;
  const history: [TabId, number][] = report ? [
    ["file-search", report.fileSearch.length], ["usb-devices", report.usb.length], ["last-activity", report.activity.length],
    ["software", report.utilities.length], ["pc-registry", report.registry.length], ["steam-accounts", report.steam.length],
    ["traces", report.traces.length], ["processes", report.processes.length], ["renamed-files", report.renamed.length],
    ["sites", report.sites.length], ["other", report.other.length],
  ] : [];

  return (
    <div className="drag-region relative z-40 flex h-11 shrink-0 items-center justify-between border-b border-edge bg-panel">
      <div ref={ref} className="relative flex items-center gap-1 pl-3">
        <IconBtn title={t.titlebar.zoomOut} onClick={() => a.zoomOut()}><ZoomOut size={15} /></IconBtn>
        <IconBtn title={t.titlebar.zoomIn} onClick={() => a.zoomIn()}><ZoomIn size={15} /></IconBtn>
        <IconBtn title={t.titlebar.refresh} onClick={() => a.reload()}><RefreshCw size={15} /></IconBtn>
        <div className="mx-2 h-4 w-px bg-edge" />
        <IconBtn title={t.titlebar.sound} onClick={() => setSound(s => !s)}>{sound ? <Volume2 size={15} /> : <VolumeX size={15} />}</IconBtn>
        <IconBtn title={t.titlebar.notifications} onClick={() => void open("notifications")}><Bell size={15} />{sites.length > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}</IconBtn>
        <IconBtn title={t.titlebar.settings} onClick={() => void open("settings")}><Settings size={15} /></IconBtn>
        <div className="mx-2 h-4 w-px bg-edge" />
        <div title={t.language} className="no-drag flex items-center rounded-md border border-edge bg-base px-1"><Globe size={13} className="ml-1 text-muted" />{languageButtons}</div>
        <IconBtn title={t.titlebar.history} onClick={() => void open("history")}><History size={15} /></IconBtn>
        {panel && <section role="dialog" aria-label={t.titlebar[panel]} className="no-drag absolute left-3 top-10 w-[360px] max-w-[92vw] rounded-xl border border-edge bg-panel p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between text-[13px] font-semibold text-white"><span>{t.titlebar[panel]}</span><IconBtn title={t.panels.close} onClick={() => setPanel(null)}><X size={14} /></IconBtn></div>
          {error && <p role="alert" className="mb-3 text-[12px] text-red-300">{error}</p>}
          {loading ? <Loader2 size={18} className="mx-auto my-5 animate-spin text-muted" /> : <>
            {panel === "settings" && <div className="space-y-3 text-[12px] text-muted">
              <div className="flex items-center justify-between"><span>{t.language}</span>{languageButtons}</div>
              <div className="flex items-center justify-between"><span>{t.titlebar.sound}</span><button type="button" role="switch" aria-checked={sound} onClick={() => setSound(s => !s)} className="rounded border border-edge px-3 py-1.5 text-white hover:bg-edge">{sound ? t.panels.on : t.panels.off}</button></div>
              <div className="flex items-center justify-between"><span>{t.panels.zoom}</span><div className="flex"><IconBtn title={t.titlebar.zoomOut} onClick={() => a.zoomOut()}><ZoomOut size={15} /></IconBtn><IconBtn title={t.titlebar.zoomIn} onClick={() => a.zoomIn()}><ZoomIn size={15} /></IconBtn></div></div>
              <p className="text-[10px] leading-relaxed text-faint">{t.compatibility}</p>
            </div>}
            {panel === "notifications" && <div className="space-y-3 text-[12px] text-muted">{sites.length ? <><p>{t.detect.found}: {sites.length}</p><div className="max-h-48 overflow-y-auto">{sites.map(item => <p key={item.id} className="py-1 font-mono text-[11px] text-amber-300">{item.domain} · {item.browser}</p>)}</div><button type="button" onClick={() => navigate("sites")} className="rounded-md bg-accent px-3 py-2 font-semibold text-white">{t.detect.view}</button></> : <p>{t.panels.noNotifications}</p>}</div>}
            {panel === "history" && <><p className="mb-2 text-[11px] text-faint">{t.panels.sessionResults}</p><div className="max-h-64 overflow-y-auto">{history.map(([tab, count]) => <button type="button" key={tab} onClick={() => navigate(tab)} className="flex w-full items-center justify-between border-b border-edge/50 py-2 text-left text-[12px] text-muted hover:text-white"><span>{t.nav[tab]}</span><span className="font-mono">{count}</span></button>)}</div></>}
          </>}
        </section>}
      </div>
      <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-[11px] font-semibold tracking-[0.3em] text-faint xl:block">MYTHIC CHECKER</div>
      <div className="no-drag flex items-center">
        <IconBtn title={t.panels.minimize} onClick={() => a.windowMinimize()}><Minus size={15} /></IconBtn>
        <IconBtn title={t.panels.maximize} onClick={() => a.windowToggleMaximize()}><Square size={13} /></IconBtn>
        <IconBtn title={t.panels.close} onClick={() => a.windowClose()}><X size={16} /></IconBtn>
      </div>
    </div>
  );
}
