import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { SiteEntry, TabId } from "@shared/types";
import { api } from "../api";
import type { Dict } from "../i18n";

export default function CheatDetectPanel({ t, setTab }: { t: Dict; setTab: (t: TabId) => void }) {
  const [hits, setHits] = useState<SiteEntry[] | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let alive = true;
    api()
      .getSites()
      .then((r) => {
        if (alive) setHits(r.items.filter((item) => item.browser !== "system"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!hits?.length || closed) return null;

  return (
    <div className="pointer-events-auto relative ml-auto mb-5 w-[330px] max-w-full animate-fade-up rounded-lg border border-edge bg-panel/95 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">{t.detect.title}</span>
        <button onClick={() => setClosed(true)} className="text-faint transition-colors hover:text-white">
          <X size={14} />
        </button>
      </div>
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
          <span className="text-[12.5px] font-bold text-white">{t.detect.browserTraces}</span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-faint">{t.detect.risky}</span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
          {t.detect.found}: <span className="font-mono font-bold text-amber-400">{hits.length}</span>
        </p>
        <button
          onClick={() => setTab("sites")}
          className="mt-2.5 flex items-center gap-1 text-[11.5px] font-semibold text-red-400 transition-colors hover:text-red-300"
        >
          {t.detect.view} <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
