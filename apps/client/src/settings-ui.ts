import { getSettings, updateSettings } from "./settings.js";

/** Settings modal (spec §80) — built once, opened from home or in-game. */

let built = false;

export function openSettings(): void {
  ensureBuilt();
  document.getElementById("settings-modal")!.classList.add("visible");
}

function ensureBuilt(): void {
  if (built) return;
  built = true;
  const s = getSettings();
  const modal = document.createElement("div");
  modal.id = "settings-modal";
  modal.innerHTML = `
    <div class="settings-card" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <label>Music <input id="set-music" type="range" min="0" max="100" value="${Math.round(s.musicVol * 100)}"></label>
      <label>Sound effects <input id="set-sfx" type="range" min="0" max="100" value="${Math.round(s.sfxVol * 100)}"></label>
      <label class="row">Quality
        <select id="set-quality">
          <option value="high"${s.quality === "high" ? " selected" : ""}>High</option>
          <option value="low"${s.quality === "low" ? " selected" : ""}>Low</option>
        </select>
      </label>
      <label class="row">Reduced motion <input id="set-motion" type="checkbox"${s.reducedMotion ? " checked" : ""}></label>
      <label class="row">Show debug info <input id="set-debug" type="checkbox"${s.showDebug ? " checked" : ""}></label>
      <button id="settings-close">DONE</button>
    </div>`;
  const style = document.createElement("style");
  style.textContent = `
    #settings-modal {
      position: fixed; inset: 0; z-index: 40; display: none;
      align-items: center; justify-content: center;
      background: rgba(10, 4, 26, 0.7);
    }
    #settings-modal.visible { display: flex; }
    .settings-card {
      width: min(360px, 88vw);
      background: #1d0f42; border: 2px solid #4a2f8f; border-radius: 18px;
      padding: 22px 24px; color: #fff;
      display: flex; flex-direction: column; gap: 14px;
    }
    .settings-card h2 { font-size: 22px; color: #ffd166; }
    .settings-card label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: #b9a7e6; }
    .settings-card label.row { flex-direction: row; justify-content: space-between; align-items: center; }
    .settings-card input[type=range] { accent-color: #ffb545; }
    .settings-card select {
      background: #12082b; color: #fff; border: 1px solid #4a2f8f;
      border-radius: 8px; padding: 4px 10px; font-family: inherit;
    }
    #settings-close {
      margin-top: 6px; padding: 11px; font-size: 16px; font-weight: 800;
      border-radius: 12px; border: 0; cursor: pointer; color: #2b1a00;
      background: linear-gradient(180deg, #ffe08a 0%, #ffb545 100%);
      font-family: inherit;
    }`;
  document.body.appendChild(style);
  document.body.appendChild(modal);

  const $ = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  $("set-music").oninput = () => updateSettings({ musicVol: Number($("set-music").value) / 100 });
  $("set-sfx").oninput = () => updateSettings({ sfxVol: Number($("set-sfx").value) / 100 });
  ($("set-quality") as unknown as HTMLSelectElement).onchange = () =>
    updateSettings({ quality: ($("set-quality") as unknown as HTMLSelectElement).value as "high" | "low" });
  $("set-motion").onchange = () => updateSettings({ reducedMotion: $("set-motion").checked });
  $("set-debug").onchange = () => updateSettings({ showDebug: $("set-debug").checked });
  document.getElementById("settings-close")!.addEventListener("click", () => {
    modal.classList.remove("visible");
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("visible");
  });
}
