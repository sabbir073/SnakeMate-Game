import { GAME, SKINS } from "@nibblio/config";
import { PROTOCOL_VERSION } from "@nibblio/protocol";
import { startGame } from "./game.js";
import { openSettings } from "./settings-ui.js";

declare const __CLIENT_VERSION__: string | undefined;
export const CLIENT_VERSION: string =
  typeof __CLIENT_VERSION__ === "string" ? __CLIENT_VERSION__ : "0.1.0-dev";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const home = $("home");
const skinRow = document.getElementById("skins");
const nicknameInput = $<HTMLInputElement>("nickname");
const playBtn = $<HTMLButtonElement>("play");
const statusEl = $("status");
const versionEl = $("version");

const logoEl = $("logo-title");
logoEl.textContent = "";
const logoImg = document.createElement("img");
logoImg.src = "/assets/logo.png";
logoImg.alt = GAME.name;
logoImg.decoding = "async";
logoImg.style.width = "min(420px, 76vw)";
logoEl.appendChild(logoImg);
$("tagline").textContent = GAME.tagline;
document.title = `${GAME.name} — multiplayer worm arena`;
versionEl.textContent = `v${CLIENT_VERSION} · protocol ${PROTOCOL_VERSION}`;

// remember nickname locally (conveniences only — server sanitizes anyway)
try {
  const saved = localStorage.getItem("nibblio.nickname");
  if (saved) nicknameInput.value = saved;
} catch { /* storage unavailable — fine */ }

let selectedSkin = "s0";
try {
  selectedSkin = localStorage.getItem("nibblio.skin") ?? "s0";
} catch { /* ignore */ }

async function onPlay(): Promise<void> {
  playBtn.disabled = true;
  const nickname = nicknameInput.value.trim() || "Worm";
  try {
    localStorage.setItem("nibblio.nickname", nickname);
  } catch { /* ignore */ }

  try {
    statusEl.textContent = "Connecting…";
    await startGame({
      nickname,
      skinId: selectedSkin,
      onStatus: (s) => { statusEl.textContent = s; },
    });
    home.classList.add("hidden");
    statusEl.textContent = "";
  } catch (err) {
    console.error("[nibblio] failed to join:", err);
    statusEl.textContent = "Could not reach the game server. Retry in a moment.";
  } finally {
    playBtn.disabled = false;
  }
}

playBtn.addEventListener("click", () => void onPlay());
document.getElementById("settings-btn-home")?.addEventListener("click", openSettings);
document.getElementById("settings-btn-game")?.addEventListener("click", openSettings);
nicknameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void onPlay();
});

// ── skin picker ──────────────────────────────────────────────────────────────

if (skinRow) {
  for (const skin of SKINS) {
    const b = document.createElement("button");
    b.className = "skin-dot";
    b.style.background = `radial-gradient(circle at 35% 30%, ${skin.accent}, ${skin.base} 60%, ${skin.shade})`;
    b.title = skin.name;
    b.setAttribute("aria-label", `Skin: ${skin.name}`);
    if (skin.id === selectedSkin) b.classList.add("selected");
    b.addEventListener("click", () => {
      selectedSkin = skin.id;
      try {
        localStorage.setItem("nibblio.skin", skin.id);
      } catch { /* ignore */ }
      skinRow.querySelectorAll(".skin-dot").forEach((el) => el.classList.remove("selected"));
      b.classList.add("selected");
    });
    skinRow.appendChild(b);
  }
}
