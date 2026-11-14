import { useRef, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, ShieldAlert, ShieldCheck, ShieldQuestion, User } from "lucide-react";
import type { SteamAccount } from "@shared/types";
import { api } from "../api";
import { TabHeader } from "../components/TabHeader";
import { fmtTime } from "../components/ui";
import type { Dict } from "../i18n";
import { useTabData } from "./Generic";

function AccountCard({ acc, t, detailed = false }: { acc: SteamAccount; t: Dict; detailed?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const banned = acc.vacStatus === "banned";
  const Icon = banned ? ShieldAlert : acc.vacStatus === "clean" ? ShieldCheck : ShieldQuestion;
  const badge = banned ? "badge-high" : acc.vacStatus === "clean" ? "badge-low" : "badge border border-edge bg-base text-faint";
  const rows = [
    [t.steam.lastIp, acc.lastSessionIp ?? "—"], [t.steam.realName, acc.realName ?? "—"],
    [t.steam.memberSince, acc.memberSince ?? "—"], [t.steam.lastLogin, fmtTime(acc.lastLogin ?? "")],
  ];

  return (
    <div className={`rounded-lg border bg-panel shadow-card ${acc.mostRecent ? "border-accent/30" : "border-edge"}`}>
      <div className="flex items-center gap-3.5 p-4">
        <div className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-edge bg-base ${detailed ? "h-16 w-16" : "h-11 w-11"}`}>
          {acc.avatarUrl ? <img src={acc.avatarUrl} alt="" className="h-full w-full object-cover" /> : <User size={detailed ? 26 : 18} className="text-faint" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate font-bold text-white ${detailed ? "text-[17px]" : "text-[13px]"}`}>{acc.personaName === "—" ? acc.accountName : acc.personaName}</div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted">
            {acc.steamId64}
            <button title={t.table.steamId64} onClick={async () => {
              try { await navigator.clipboard.writeText(acc.steamId64); setCopied(true); setCopyError(false); }
              catch { setCopyError(true); }
            }} className="text-faint hover:text-white">{copied ? <Check size={12} /> : <Copy size={12} />}</button>
            {copied && <span className="text-emerald-400">{t.steam.copied}</span>}
            {copyError && <span className="text-red-300">{t.toolState.failed}</span>}
          </div>
          {<div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`${badge} gap-1`}><Icon size={11} />{t.vacStatus[acc.vacStatus]}</span>
            {acc.privacy && <span className="badge border border-edge bg-base text-faint">{t.steam.profile}: {t.steam.privacy[acc.privacy]}</span>}
          </div>}
        </div>
        {!detailed && <div className="text-right"><div className="font-mono text-[20px] font-bold text-white">{acc.level ?? "—"}</div><div className="text-[8px] tracking-wider text-faint">{t.steam.levelShort}</div></div>}
      </div>
      {detailed && <div className="border-t border-edge px-4 pb-3">
        {rows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-edge/50 py-2.5 text-[11.5px] last:border-0"><span className="text-faint">{label}</span><span className="text-right font-mono text-[10.5px] text-muted">{value}</span></div>)}
        <button onClick={() => void api().openExternal(acc.communityUrl ?? `https://steamcommunity.com/profiles/${acc.steamId64}`)} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-edge text-[12px] text-muted hover:text-white"><ExternalLink size={13} />steamcommunity.com</button>
      </div>}
      <div className="space-y-1.5 border-t border-edge px-4 py-3 text-[11px] text-muted">
        <p>{t.steam.vacBans}: {acc.vacBans ?? "—"} · {t.steam.gameBans}: {acc.gameBans ?? "—"}</p>
        <p>CS2: <span className={acc.cs2BanStatus === "banned" ? "text-red-400" : "text-muted"}>{t.cs2Status[acc.cs2BanStatus ?? "unknown"]}</span></p>
        {acc.cs2BanDates?.map((date) => <p key={date} className="text-red-300">CS2 · {date.replace("T", " ").replace(/\.\d+Z$/, " UTC")}</p>)}
        {acc.daysSinceLastBan !== undefined && <p className="text-amber-400">{acc.daysSinceLastBan} {t.steam.daysSinceLastBan} · {t.banApprox}: {acc.lastBanDateApprox ?? "—"}</p>}
        {acc.banCheckedAt && <p className="text-[10px] text-faint">{acc.banSource} · {fmtTime(acc.banCheckedAt)}</p>}
        {acc.source && <p className="break-words text-[10px] text-faint">{t.table.source}: {acc.source}</p>}
      </div>
    </div>
  );
}

export default function SteamTab({ t }: { t: Dict }) {
  const roots = useRef<string[]>([]);
  const { data, running, run, error } = useTabData<SteamAccount>(() => api().getSteamAccounts(roots.current), true);
  const [exportMsg, setExportMsg] = useState("");
  const accounts = data ?? [];
  const current = accounts.find((a) => a.mostRecent) ?? accounts[0];
  const others = accounts.filter((a) => a !== current);

  return (
    <div className="space-y-5 animate-fade-up">
      <TabHeader tab="steam-accounts" t={t} actions={<>
        <button disabled={running} className="h-9 rounded-md border border-edge bg-panel px-3 text-[12px] text-white disabled:opacity-50" onClick={async () => {
          try {
            const selected = await api().selectFolders();
            if (selected.length) { roots.current = [...new Set([...roots.current, ...selected])]; await run(); }
          } catch { setExportMsg(t.actionFailed); }
        }}>{t.steamFolder}</button>
        <button disabled={running || !accounts.length} onClick={async () => {
          try { if ((await api().exportAccounts()).ok) setExportMsg(t.steam.exportOk); }
          catch { setExportMsg(t.toolState.failed); }
        }} className="flex h-9 items-center gap-2 rounded-md border border-edge bg-panel px-3.5 text-[12px] font-semibold text-white disabled:opacity-50"><Copy size={13} />{t.steam.exportBtn}</button>
        <button disabled={running} onClick={() => void run()} className="flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-[12px] font-bold text-white shadow-accent-glow hover:bg-red-700 disabled:opacity-50">{running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{t.runCheck}</button>
      </>} />
      {(error || exportMsg) && <p role="status" className="text-[12px] text-muted">{error || exportMsg}</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section><div className="mb-3 text-[10px] tracking-wider text-faint">{t.steam.current}</div>
          {current ? <AccountCard acc={current} t={t} detailed /> : <div className="rounded-lg border border-edge bg-panel p-8 text-[12px] text-faint">{running ? t.scanning : t.empty.generic.title}</div>}
          <p className="mt-3 text-[11px] leading-relaxed text-faint">{t.steamVacHint}</p>
        </section>
        <section><div className="mb-3 text-[10px] tracking-wider text-faint">{t.steam.others} · {others.length}</div>
          <div className="space-y-2.5">{others.map((a) => <AccountCard key={a.id} acc={a} t={t} />)}
            {!others.length && !running && <div className="rounded-lg border border-edge bg-panel p-6 text-center text-[12px] text-faint">—</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
