import type { MythicApi } from "@shared/types";

declare global {
  interface Window {
    mythic: MythicApi;
  }
}

export {};
