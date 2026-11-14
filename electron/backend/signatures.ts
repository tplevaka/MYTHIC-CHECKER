import fs from "node:fs";
import path from "node:path";
import bundled from "./data/signatures.json";

export interface CheatSignature {
  cheat: string;
  risk: "high" | "medium" | "low";
  files: string[];
  folders: string[];
  extensions: string[];
}

export interface SignatureDb {
  cheats: CheatSignature[];
  cheatDomains: string[];
  cheatProcesses: string[];
  scriptPatterns: { regex: string; label: string }[];
}

let cached: SignatureDb | null = null;

/**
 * Loads the signature database: bundled JSON by default, with an optional
 * external override (extraResources in packaged builds or a local file) so
 * admins can extend signatures without rebuilding.
 */
export function loadSignatures(): SignatureDb {
  if (cached) return cached;
  const candidates = [
    path.join(process.resourcesPath || "", "signatures", "signatures.json"),
    path.join(process.cwd(), "electron", "backend", "data", "signatures.json"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        cached = JSON.parse(fs.readFileSync(file, "utf-8")) as SignatureDb;
        return cached;
      }
    } catch {
      /* try next candidate */
    }
  }
  cached = bundled as unknown as SignatureDb;
  return cached;
}

const lowerFileIndex = new Map<string, { cheat: string; risk: CheatSignature["risk"] }>();
const lowerFolderIndex = new Map<string, CheatSignature["risk"]>();
let indexed = false;

function buildIndex(): void {
  if (indexed) return;
  for (const sig of loadSignatures().cheats) {
    for (const f of sig.files) lowerFileIndex.set(f.toLowerCase(), { cheat: sig.cheat, risk: sig.risk });
    for (const folder of sig.folders) {
      for (const part of folder.toLowerCase().split(/[\\/]+/)) {
        if (part && part.length > 3) lowerFolderIndex.set(part, sig.risk);
      }
    }
  }
  indexed = true;
}

/** Match a single file path against the signature database. */
export function matchPath(
  fullPath: string,
): { cheat: string; risk: CheatSignature["risk"]; signature: string } | null {
  buildIndex();
  const fileName = path.basename(fullPath).toLowerCase();
  const direct = lowerFileIndex.get(fileName);
  if (direct) return { cheat: direct.cheat, risk: direct.risk, signature: `file:${fileName}` };

  const parts = fullPath.toLowerCase().split(/[\\/]+/);
  for (const part of parts) {
    const risk = lowerFolderIndex.get(part);
    if (risk) {
      const sig = loadSignatures().cheats.find((c) => c.folders.some((f) => f.toLowerCase().split(/[\\/]+/).includes(part)));
      return { cheat: sig?.cheat ?? part, risk, signature: `folder:${part}` };
    }
  }
  return null;
}

export function matchProcess(processName: string): { cheat: string; risk: CheatSignature["risk"] } | null {
  const db = loadSignatures();
  const n = processName.toLowerCase();
  for (const sig of db.cheats) {
    if (sig.files.some((f) => f.toLowerCase() === n)) return { cheat: sig.cheat, risk: sig.risk };
  }
  if (db.cheatProcesses.includes(n)) return { cheat: "Known cheat process", risk: "high" };
  return null;
}
