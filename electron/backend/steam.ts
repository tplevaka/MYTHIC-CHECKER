import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import type { SteamAccount, TabResult } from "../shared/types";
import { home, isWin, steamVdfPaths, runCmd } from "./platform";

const STEAM64_BASE = 76561197960265728n;
interface Vdf { [key: string]: string | Vdf }

function parseVdf(text: string): Vdf {
  const tokens = text.replace(/^\s*\/\/.*$/gm, "").match(/"(?:\\.|[^"\\])*"|[{}]/g) ?? [];
  let index = 0;
  const unquote = (s: string) => s.slice(1, -1).replace(/\\(["\\])/g, "$1");
  const block = (): Vdf => {
    const out: Vdf = {};
    while (index < tokens.length) {
      const key = tokens[index++];
      if (key === "}") break;
      const value = tokens[index++];
      if (!value || key === "{") break;
      out[unquote(key)] = value === "{" ? block() : unquote(value);
    }
    return out;
  };
  return block();
}

function child(v: Vdf, key: string): Vdf {
  const value = v[Object.keys(v).find((k) => k.toLowerCase() === key.toLowerCase()) ?? ""];
  return typeof value === "object" ? value : {};
}

function field(v: Vdf, key: string): string {
  const value = v[Object.keys(v).find((k) => k.toLowerCase() === key.toLowerCase()) ?? ""];
  return typeof value === "string" ? value : "";
}

function blank(steamId64: string, source: string): SteamAccount {
  return { id: `steam-${steamId64}`, steamId64, accountName: "—", personaName: "—", mostRecent: false,
    vacStatus: "unknown", cs2BanStatus: "unknown", communityUrl: `https://steamcommunity.com/profiles/${steamId64}`, source };
}

export function parseLoginUsers(text: string): SteamAccount[] {
  return Object.entries(child(parseVdf(text), "users")).flatMap(([id, value]) => {
    if (!/^\d{17}$/.test(id) || typeof value !== "object") return [];
    const ts = Number(field(value, "Timestamp"));
    return [{ ...blank(id, "loginusers.vdf"), accountName: field(value, "AccountName") || "—",
      personaName: field(value, "PersonaName") || "—", mostRecent: field(value, "MostRecent") === "1",
      lastLogin: ts > 0 && ts < 8640000000000 ? new Date(ts * 1000).toISOString() : undefined }];
  });
}

export function parseConfigAccounts(text: string): { accountName: string; steamId64: string }[] {
  const out: { accountName: string; steamId64: string }[] = [];
  const visit = (v: Vdf) => {
    for (const [key, value] of Object.entries(v)) {
      if (typeof value !== "object") continue;
      if (key.toLowerCase() === "accounts") {
        for (const [accountName, account] of Object.entries(value)) {
          if (typeof account !== "object") continue;
          const steamId64 = field(account, "SteamID");
          if (/^\d{17}$/.test(steamId64)) out.push({ accountName, steamId64 });
        }
      } else visit(value);
    }
  };
  visit(parseVdf(text));
  return out;
}

async function steamRoots(extra: string[]): Promise<string[]> {
  const roots = [...steamVdfPaths().map((p) => path.dirname(path.dirname(p))), ...extra];
  if (isWin) {
    const profiles = await runCmd("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList", "/s", "/v", "ProfileImagePath"], 5000);
    for (const line of profiles.split(/\r?\n/)) {
      const m = /ProfileImagePath\s+REG_\w+\s+(.+)/i.exec(line);
      if (m) roots.push(path.join(m[1].trim().replace(/%([^%]+)%/g, (_, k: string) => process.env[k] ?? `%${k}%`), "AppData", "Local", "Steam"));
    }
    const hives = await runCmd("reg", ["query", "HKU"], 5000);
    const keys = ["HKCU\\SOFTWARE\\Valve\\Steam", "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "HKLM\\SOFTWARE\\Valve\\Steam",
      ...hives.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^HKEY_USERS\\S-1-5-21-[\d-]+$/.test(s)).map((s) => `${s}\\SOFTWARE\\Valve\\Steam`)];
    await Promise.all(keys.map(async (key) => {
      const text = await runCmd("reg", ["query", key], 5000);
      for (const m of text.matchAll(/(?:SteamPath|InstallPath)\s+REG_SZ\s+(.+)/gi)) roots.push(path.normalize(m[1].trim()));
    }));
    const running = await runCmd("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Get-Process -Name steam -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }"], 5000);
    for (const exe of running.split(/\r?\n/).filter((s) => /steam\.exe$/i.test(s.trim()))) roots.push(path.dirname(exe.trim()));
  } else {
    roots.push(path.join(home, ".steam", "root"), path.join(home, "snap", "steam", "common", ".local", "share", "Steam"));
    const users = await fs.promises.readdir("/home").catch(() => [] as string[]);
    for (const user of users) {
      const base = path.join("/home", user);
      roots.push(path.join(base, ".steam", "steam"), path.join(base, ".local", "share", "Steam"),
        path.join(base, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"));
    }
  }
  const seen = new Set<string>();
  return roots.flatMap((r) => {
    try {
      const canonical = fs.realpathSync(r);
      const key = isWin ? canonical.toLowerCase() : canonical;
      if (seen.has(key)) return [];
      seen.add(key);
      return [canonical];
    } catch { return []; }
  });
}

function readText(p: string): string {
  try { return fs.statSync(p).size <= 8 * 1024 * 1024 ? fs.readFileSync(p, "utf-8") : ""; }
  catch { return ""; }
}

export async function collectLocal(extra: string[] = []): Promise<SteamAccount[]> {
  const byId = new Map<string, SteamAccount>();
  const add = (acc: SteamAccount) => {
    const prev = byId.get(acc.steamId64);
    if (!prev) { byId.set(acc.steamId64, acc); return; }
    if (prev.accountName === "—" && acc.accountName !== "—") prev.accountName = acc.accountName;
    if (prev.personaName === "—" && acc.personaName !== "—") prev.personaName = acc.personaName;
    prev.mostRecent ||= acc.mostRecent;
    if (acc.lastLogin && (!prev.lastLogin || acc.lastLogin > prev.lastLogin)) prev.lastLogin = acc.lastLogin;
    prev.source = [...new Set([...(prev.source ?? "").split(" · "), acc.source ?? ""])].filter(Boolean).join(" · ");
  };
  for (const root of await steamRoots(extra)) {
    for (const acc of parseLoginUsers(readText(path.join(root, "config", "loginusers.vdf")))) add(acc);
    for (const a of parseConfigAccounts(readText(path.join(root, "config", "config.vdf")))) add({ ...blank(a.steamId64, "config.vdf"), accountName: a.accountName });
    const userdata = path.join(root, "userdata");
    const dirs = await fs.promises.readdir(userdata, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
    for (const d of dirs) {
      if (!d.isDirectory() || !/^\d+$/.test(d.name) || BigInt(d.name) === 0n || BigInt(d.name) > 4294967295n) continue;
      const steamId64 = (STEAM64_BASE + BigInt(d.name)).toString();
      const local = readText(path.join(userdata, d.name, "config", "localconfig.vdf"));
      const persona = /"PersonaName"\s+"([^"]*)"/i.exec(local)?.[1];
      add({ ...blank(steamId64, "userdata"), personaName: persona || "—" });
    }
  }
  return [...byId.values()].sort((a, b) => Number(b.mostRecent) - Number(a.mostRecent) || (b.lastLogin ?? "").localeCompare(a.lastLogin ?? ""));
}

function get(url: string, redirects = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000, headers: { "User-Agent": "MYTHIC-Checker/1.4.0", "Accept-Language": "en-US,en;q=0.9" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, url);
        res.resume();
        if (next.protocol !== "https:" || next.hostname !== new URL(url).hostname) { reject(new Error("Unexpected redirect")); return; }
        resolve(get(next.toString(), redirects - 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error("Steam unavailable")); return; }
      let data = "";
      res.setEncoding("utf-8");
      res.on("data", (c: string) => { data += c; if (data.length > 2 * 1024 * 1024) req.destroy(new Error("Response too large")); });
      res.on("error", reject);
      res.on("end", () => resolve(data));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

const xmlTag = (xml: string, tag: string) => {
  const m = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${tag}>`, "i").exec(xml);
  return m ? (m[1] ?? m[2] ?? "").trim() : "";
};

export function applyCommunityBans(acc: SteamAccount, html: string): void {
  const vac = /(\d+)\s+VAC\s+ban\(s\) on record/i.exec(html);
  const game = /(\d+)\s+game\s+ban\(s\) on record/i.exec(html);
  if (vac) { acc.vacBans = Number(vac[1]); acc.vacStatus = acc.vacBans > 0 ? "banned" : "clean"; }
  if (game) acc.gameBans = Number(game[1]);
  const days = /(\d+)\s+day\(s\) since last ban/i.exec(html);
  if (days && (vac || game)) {
    acc.daysSinceLastBan = Number(days[1]);
    acc.lastBanDateApprox = new Date(Date.now() - acc.daysSinceLastBan * 86400000).toISOString().slice(0, 10);
  }
  if (vac || game) { acc.banSource = "Steam Community"; acc.banCheckedAt = new Date().toISOString(); }
}

async function enrichFromCommunity(acc: SteamAccount): Promise<void> {
  await Promise.all([
    (async () => {
      try {
        const xml = await get(`https://steamcommunity.com/profiles/${acc.steamId64}/?xml=1`);
        if (!xml.includes("<profile>")) return;
        acc.personaName = xmlTag(xml, "steamID") || acc.personaName;
        acc.avatarUrl = xmlTag(xml, "avatarFull") || undefined;
        acc.realName = xmlTag(xml, "realname") || undefined;
        acc.memberSince = xmlTag(xml, "memberSince") || undefined;
        const privacy = xmlTag(xml, "privacyState").toLowerCase();
        acc.privacy = privacy === "public" ? "public" : privacy === "friendsonly" ? "friends" : privacy ? "private" : undefined;
        const vac = xmlTag(xml, "vacBanned");
        if (vac === "0" || vac === "1") {
          acc.vacStatus = vac === "1" ? "banned" : "clean";
          acc.banSource = "Steam Community";
          acc.banCheckedAt = new Date().toISOString();
        }
      } catch { /* Public fields may be unavailable. */ }
    })(),
    (async () => {
      try {
        const html = await get(`https://steamcommunity.com/profiles/${acc.steamId64}/?l=english`);
        const lvl = /friendPlayerLevelNum">\s*(\d+)\s*</i.exec(html);
        if (lvl) acc.level = Number(lvl[1]);
        applyCommunityBans(acc, html);
      } catch { /* Public fields may be unavailable. */ }
    })(),
  ]);
}

interface BanInfo {
  SteamId: string;
  VACBanned: boolean;
  NumberOfVACBans: number;
  DaysSinceLastBan: number;
  NumberOfGameBans: number;
  bans?: { AppIdMin: number; AppIdMax: number; BanStartTime: number; BanType: number }[];
}

export function applyApiBans(acc: SteamAccount, p: BanInfo): void {
  if (typeof p.VACBanned !== "boolean" || !Number.isInteger(p.NumberOfVACBans) || !Number.isInteger(p.NumberOfGameBans)) return;
  acc.vacStatus = p.VACBanned ? "banned" : "clean";
  acc.vacBans = p.NumberOfVACBans;
  acc.gameBans = p.NumberOfGameBans;
  const banned = p.NumberOfVACBans + p.NumberOfGameBans > 0;
  acc.daysSinceLastBan = banned && Number.isInteger(p.DaysSinceLastBan) && p.DaysSinceLastBan >= 0 ? p.DaysSinceLastBan : undefined;
  acc.lastBanDateApprox = acc.daysSinceLastBan === undefined ? undefined : new Date(Date.now() - acc.daysSinceLastBan * 86400000).toISOString().slice(0, 10);
  const cs2 = (p.bans ?? []).filter((b) => b.AppIdMin <= 730 && b.AppIdMax >= 730);
  acc.cs2BanStatus = cs2.length ? "banned" : !p.VACBanned && !banned ? "clean" : "unknown";
  acc.cs2BanDates = cs2.filter((b) => Number.isInteger(b.BanStartTime) && b.BanStartTime > 0 && b.BanStartTime * 1000 <= Date.now()).map((b) => new Date(b.BanStartTime * 1000).toISOString());
  acc.banSource = "Steam Web API";
  acc.banCheckedAt = new Date().toISOString();
}

async function enrichBansFromApi(accounts: SteamAccount[]): Promise<void> {
  const key = process.env.MYTHIC_STEAM_API_KEY;
  if (!key) return;
  for (let start = 0; start < accounts.length; start += 100) {
    const batch = accounts.slice(start, start + 100);
    try {
      const raw = await get(`https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${encodeURIComponent(key)}&steamids=${batch.map((a) => a.steamId64).join(",")}`);
      for (const p of (JSON.parse(raw) as { players?: BanInfo[] }).players ?? []) {
        const acc = batch.find((a) => a.steamId64 === p.SteamId);
        if (acc) applyApiBans(acc, p);
      }
    } catch { /* Never infer a clean status from an API failure. */ }
  }
}

export async function collectSteamAccounts(extra: string[] = []): Promise<TabResult<SteamAccount>> {
  const started = Date.now();
  const accounts = await collectLocal(extra);
  for (let i = 0; i < accounts.length; i += 4) await Promise.all(accounts.slice(i, i + 4).map(enrichFromCommunity));
  await enrichBansFromApi(accounts);
  return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items: accounts,
    error: accounts.length ? undefined : "No readable retained Steam accounts. Select the Steam installation folder if it is in a custom location." };
}
