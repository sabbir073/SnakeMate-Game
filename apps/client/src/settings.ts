/** Persisted player settings (spec §80). localStorage-backed, safe defaults. */

export interface Settings {
  musicVol: number; // 0..1
  sfxVol: number; // 0..1
  quality: "high" | "low";
  reducedMotion: boolean;
  showDebug: boolean;
}

const KEY = "nibblio.settings";

const DEFAULTS: Settings = {
  musicVol: 0.5,
  sfxVol: 0.8,
  quality: "high",
  reducedMotion: false,
  showDebug: false,
};

let cached: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    cached = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    cached = { ...DEFAULTS };
  }
  // respect the OS-level preference on first run
  try {
    if (!localStorage.getItem(KEY) && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cached.reducedMotion = true;
    }
  } catch { /* ignore */ }
  return cached;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  for (const cb of listeners) cb(next);
  return next;
}

export function onSettingsChange(cb: (s: Settings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
