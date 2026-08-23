import type { DeathMessage, LeaderboardMessage } from "@nibblio/protocol";

/** DOM-based HUD (score, leaderboard, death screen). DOM keeps text crisp at
 *  every DPI and free of the WebGL frame budget; per CLAUDE.md, dynamic text
 *  is never baked into canvas/art. */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

export class Hud {
  private hud = $("hud");
  private scoreValue = $("score-value");
  private scoreSub = $("score-sub");
  private lbList = $("leaderboard-list");
  private ownRank = $("own-rank");
  private effectsEl = $("effects");
  private lastEffects = "";
  private death = $("death");
  private deathStats = $("death-stats");
  private respawnBtn = $<HTMLButtonElement>("respawn");
  private lastRank = 0;

  constructor(onRespawn: () => void) {
    this.respawnBtn.onclick = () => {
      this.hideDeath();
      onRespawn();
    };
  }

  show(): void {
    this.hud.classList.add("visible");
  }

  hide(): void {
    this.hud.classList.remove("visible");
    this.hideDeath();
  }

  setScore(score: number, mass: number): void {
    this.scoreValue.textContent = String(Math.floor(score));
    const rankTxt = this.lastRank > 0 ? `#${this.lastRank}` : "—";
    this.scoreSub.textContent = `mass ${Math.floor(mass)} · rank ${rankTxt}`;
  }

  /** Active powerup chips, e.g. ["SPEED", "MAGNET"]. */
  setEffects(kinds: string[]): void {
    const key = kinds.join(",");
    if (key === this.lastEffects) return;
    this.lastEffects = key;
    this.effectsEl.innerHTML = kinds
      .map((k) => `<span class="effect-chip">${escapeHtml(k.replace(/_/g, " "))}</span>`)
      .join("");
  }

  setLeaderboard(msg: LeaderboardMessage, ownId: string): void {
    this.lastRank = msg.ownRank;
    const rows = msg.top.map((e, i) => {
      const me = e.id === ownId ? ' class="me"' : "";
      return `<li${me}><span>${i + 1}. ${escapeHtml(e.name)}</span><span>${Math.floor(e.score)}</span></li>`;
    });
    this.lbList.innerHTML = rows.join("");
    this.ownRank.textContent =
      msg.ownRank > 0 ? `You: #${msg.ownRank} of ${msg.totalPlayers}` : "";
  }

  showDeath(msg: DeathMessage): void {
    const killer = msg.killedBy ? `Nibbled by ${escapeHtml(msg.killedBy)}` : "You hit the edge";
    this.deathStats.innerHTML =
      `${killer}<br>score <b>${Math.floor(msg.score)}</b> · ` +
      `survived <b>${Math.round(msg.survivedSec)}s</b> · rank <b>#${msg.rank}</b>`;
    this.death.classList.add("visible");
  }

  hideDeath(): void {
    this.death.classList.remove("visible");
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
