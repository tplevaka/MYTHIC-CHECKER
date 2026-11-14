import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { TabResult, UsbDevice } from "../shared/types";
import { isWin, runCmd } from "./platform";

function run(cmd: string, args: string[], timeout = 15000): Promise<string> {
  return runCmd(cmd, args, timeout, 16 * 1024 * 1024);
}

async function collectWindows(): Promise<UsbDevice[]> {
  const out: UsbDevice[] = [];
  const regOut = await run("reg", [
    "query", "HKLM\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR", "/s", "/f", "FriendlyName",
  ]);
  const idRe = /HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR\\([^\\]+)\\(.+)/i;
  let current: { cls: string; id: string } | null = null;
  for (const line of regOut.split(/\r?\n/)) {
    const idm = idRe.exec(line);
    if (idm) {
      current = { cls: idm[1], id: idm[2] };
      continue;
    }
    const fm = /FriendlyName\s+REG_SZ\s+(.+)/i.exec(line);
    if (fm && current) {
      out.push({
        id: `usb-${out.length}`,
        name: fm[1].trim(),
        deviceId: `${current.cls}\\${current.id}`,
        source: "USBSTOR",
      });
    }
  }

  // MountPoints2 gives user-level attachment history per volume GUID.
  const mp = await run("reg", [
    "query", `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2`, "/s",
  ]);
  for (const line of mp.split(/\r?\n/)) {
    const m = /HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\\{([0-9a-f-]+)\}/i.exec(line);
    if (m) {
      out.push({
        id: `mp-${out.length}`,
        name: `Removable volume {${m[1]}}`,
        deviceId: m[1],
        source: "MountPoints2",
      });
    }
  }
  return out;
}

async function collectLinux(): Promise<UsbDevice[]> {
  const out: UsbDevice[] = [];
  const lsusb = await run("lsusb", []);
  for (const line of lsusb.split(/\r?\n/)) {
    const m = /Bus\s+\d+\s+Device\s+\d+:\s+ID\s+([0-9a-f:]+)\s*(.*)/i.exec(line);
    if (m) {
      out.push({
        id: `usb-${out.length}`,
        name: m[2]?.trim() || `USB device ${m[1]}`,
        deviceId: m[1],
        source: "lsusb",
      });
    }
  }
  // /sys/bus/usb/devices holds per-device metadata with attach timestamps.
  const sys = "/sys/bus/usb/devices";
  try {
    for (const dev of await fs.promises.readdir(sys)) {
      const dir = path.join(sys, dev);
      try {
        const vendor = await fs.promises.readFile(path.join(dir, "idVendor"), "utf-8").catch(() => "");
        const product = await fs.promises.readFile(path.join(dir, "idProduct"), "utf-8").catch(() => "");
        const manufacturer = await fs.promises.readFile(path.join(dir, "manufacturer"), "utf-8").catch(() => "");
        const productName = await fs.promises.readFile(path.join(dir, "product"), "utf-8").catch(() => "");
        if (vendor && product) {
          const id = `${vendor.trim()}:${product.trim()}`;
          if (!out.some((d) => d.deviceId === id)) {
            out.push({
              id: `sys-${out.length}`,
              name: [manufacturer.trim(), productName.trim()].filter(Boolean).join(" ") || `USB ${id}`,
              deviceId: id,
              source: "/sys/bus/usb",
            });
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no sysfs access */
  }
  return out;
}

export async function collectUsbDevices(): Promise<TabResult<UsbDevice>> {
  const started = Date.now();
  try {
    const items = isWin ? await collectWindows() : await collectLinux();
    const dedup = new Map<string, UsbDevice>();
    for (const d of items) dedup.set(`${d.deviceId}|${d.name}`, d);
    return {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      items: [...dedup.values()],
    };
  } catch (e) {
    return {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      items: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
