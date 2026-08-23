import { getSettings, onSettingsChange } from "./settings.js";

/** Dev performance panel (spec §49) + network quality dot (spec §108).
 *  DOM overlay, updated at 4 Hz, toggled by the "show debug" setting. */

export interface DebugSample {
  fps: number;
  frameMs: number;
  visibleEntities: number;
  totalEntities: number;
  pingMs: number;
  jitterMs: number;
  serverTick: number;
  predictionError: number;
  pendingInputs: number;
  clientVersion: string;
  serverVersion: string;
}

export type NetQuality = "excellent" | "good" | "poor" | "reconnecting";

const QUALITY_COLORS: Record<NetQuality, string> = {
  excellent: "#58E6B4",
  good: "#FFD166",
  poor: "#FF6B6B",
  reconnecting: "#9D6BFF",
};

export class DebugPanel {
  private el: HTMLDivElement;
  private dot: HTMLSpanElement;
  private unsub: () => void;

  constructor() {
    this.el = document.createElement("div");
    this.el.id = "debug-panel";
    this.el.style.cssText = `
      position: absolute; z-index: 7; pointer-events: none;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
      background: rgba(18, 8, 43, 0.8); border: 1px solid #3a2477;
      border-radius: 10px; padding: 8px 12px;
      font: 11px/1.6 ui-monospace, monospace; color: #b9a7e6;
      white-space: pre; display: none;`;
    document.body.appendChild(this.el);

    // network quality dot lives in the score panel (always visible)
    this.dot = document.createElement("span");
    this.dot.id = "net-dot";
    this.dot.title = "Network quality";
    this.dot.style.cssText = `
      display: inline-block; width: 9px; height: 9px; border-radius: 50%;
      margin-left: 7px; background: ${QUALITY_COLORS.good};`;
    document.getElementById("score-value")?.appendChild(this.dot);

    this.applyVisibility();
    this.unsub = onSettingsChange(() => this.applyVisibility());
  }

  private applyVisibility(): void {
    this.el.style.display = getSettings().showDebug ? "block" : "none";
  }

  setQuality(q: NetQuality): void {
    this.dot.style.background = QUALITY_COLORS[q];
  }

  update(s: DebugSample): void {
    if (this.el.style.display === "none") return;
    this.el.textContent =
      `fps ${s.fps.toFixed(0)}  frame ${s.frameMs.toFixed(1)}ms\n` +
      `entities ${s.visibleEntities}/${s.totalEntities}\n` +
      `ping ${s.pingMs.toFixed(0)}ms  jitter ${s.jitterMs.toFixed(0)}ms\n` +
      `tick ${s.serverTick}  predErr ${s.predictionError.toFixed(1)}\n` +
      `inputQ ${s.pendingInputs}\n` +
      `v${s.clientVersion} / srv ${s.serverVersion}`;
  }

  destroy(): void {
    this.unsub();
    this.el.remove();
    this.dot.remove();
  }
}
