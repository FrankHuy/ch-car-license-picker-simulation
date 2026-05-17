import { createDefaultConfig } from "./plateEngine";
import type { PickerConfig } from "./types";

const STORAGE_KEY = "license-picker-config-v1";

export function loadConfig(): PickerConfig {
  const fallback = createDefaultConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    return {
      ...fallback,
      ...JSON.parse(raw),
    };
  } catch {
    return fallback;
  }
}

export function saveConfig(config: PickerConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
