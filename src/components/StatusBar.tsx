import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import type { Dict } from "../i18n";

export default function StatusBar({ t }: { t: Dict }) {
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const desktop = api().platform !== "browser";
  const report = async (save: boolean) => {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      if (save) {
        const result = await api().exportReport();
        if (result.ok) setMessage(t.reportSaved);
      } else {
        if (!(await api().copyReport()).ok) throw Error();
        setMessage(t.reportCopied);
      }
    } catch { setFailed(true); setMessage(t.actionFailed); }
    finally { setBusy(false); }
  };
  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-edge bg-panel px-4 text-[11px]">
      <div className="flex min-w-0 items-center gap-3 text-faint">
        <span className="hidden font-mono lg:inline">MYTHIC CHECKER</span>
        <button disabled={busy} className="flex shrink-0 items-center gap-1.5 hover:text-white disabled:opacity-50" onClick={() => void report(false)}><Copy size={12} />{t.copyReport}</button>
        <button disabled={busy} className="flex shrink-0 items-center gap-1.5 hover:text-white disabled:opacity-50" onClick={() => void report(true)}><Download size={12} />{t.export}</button>
        {message && <span role={failed ? "alert" : "status"} title={message} className={`truncate ${failed ? "text-red-300" : "text-emerald-400"}`}>{message}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <span className={`flex items-center gap-2 font-semibold tracking-wider ${desktop ? "text-emerald-400" : "text-amber-300"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{desktop ? t.connection : t.browserPreview}</span>
        <span className="font-mono text-faint">{api().version}</span>
      </div>
    </footer>
  );
}
