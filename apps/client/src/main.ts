import { GAME } from "@nibblio/config";
import { PROTOCOL_VERSION } from "@nibblio/protocol";
import { startGame } from "./game.js";

declare const __CLIENT_VERSION__: string | undefined;
export const CLIENT_VERSION: string =
  typeof __CLIENT_VERSION__ === "string" ? __CLIENT_VERSION__ : "0.1.0-dev";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const home = $("home");
const nicknameInput = $<HTMLInputElement>("nickname");
const playBtn = $<HTMLButtonElement>("play");
const statusEl = $("status");
const versionEl = $("version");

$("logo-title").textContent = GAME.name.toUpperCase();
$("tagline").textContent = GAME.tagline;
document.title = `${GAME.name} — multiplayer worm arena`;
versionEl.textContent = `v${CLIENT_VERSION} · protocol ${PROTOCOL_VERSION}`;

// remember nickname locally (conveniences only — server sanitizes anyway)
try {
  const saved = localStorage.getItem("nibblio.nickname");
  if (saved) nicknameInput.value = saved;
} catch { /* storage unavailable — fine */ }

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
nicknameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void onPlay();
});
