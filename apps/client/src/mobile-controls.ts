/** Touch controls (spec §47): left-half virtual joystick + right boost button.
 *  DOM-based (crisp, safe-area aware, outside the WebGL budget). Only mounted
 *  on coarse-pointer devices. */

export function isTouchDevice(): boolean {
  try {
    return matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  } catch {
    return false;
  }
}

export interface MobileState {
  /** Steering vector from joystick center, magnitude 0..1; null = untouched. */
  vector: { x: number; y: number } | null;
  boost: boolean;
}

export class MobileControls {
  readonly state: MobileState = { vector: null, boost: false };
  private root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private joyPointerId: number | null = null;
  private joyCenter = { x: 0, y: 0 };
  private readonly RADIUS = 56;

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "mobile-controls";
    this.root.innerHTML = `
      <div id="joy-zone"></div>
      <div id="joy-base"><div id="joy-knob"></div></div>
      <button id="boost-btn" aria-label="Boost">🚀</button>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #mobile-controls { position: absolute; inset: 0; z-index: 6; pointer-events: none; }
      #joy-zone {
        position: absolute; left: 0; top: 25%; bottom: 0; width: 50%;
        pointer-events: auto; touch-action: none;
      }
      #joy-base {
        position: absolute; display: none;
        width: 112px; height: 112px; margin: -56px 0 0 -56px;
        border-radius: 50%;
        background: rgba(124, 58, 237, 0.18);
        border: 2px solid rgba(167, 139, 250, 0.55);
        backdrop-filter: blur(2px);
      }
      #joy-knob {
        position: absolute; left: 50%; top: 50%;
        width: 52px; height: 52px; margin: -26px 0 0 -26px;
        border-radius: 50%;
        background: rgba(255, 209, 102, 0.9);
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      }
      #boost-btn {
        position: absolute;
        right: max(22px, calc(env(safe-area-inset-right) + 10px));
        bottom: max(30px, calc(env(safe-area-inset-bottom) + 16px));
        width: 84px; height: 84px; border-radius: 50%;
        border: 3px solid rgba(255, 209, 102, 0.7);
        background: rgba(255, 181, 69, 0.28);
        font-size: 34px; pointer-events: auto; touch-action: none;
        -webkit-user-select: none; user-select: none;
      }
      #boost-btn.active { background: rgba(255, 181, 69, 0.75); transform: scale(0.94); }
    `;
    this.root.appendChild(style);
    document.body.appendChild(this.root);

    this.stickBase = this.root.querySelector("#joy-base") as HTMLDivElement;
    this.stickKnob = this.root.querySelector("#joy-knob") as HTMLDivElement;
    const zone = this.root.querySelector("#joy-zone") as HTMLDivElement;
    const boostBtn = this.root.querySelector("#boost-btn") as HTMLButtonElement;

    zone.addEventListener("pointerdown", (e) => {
      if (this.joyPointerId !== null) return;
      this.joyPointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.joyCenter = { x: e.clientX, y: e.clientY };
      this.stickBase.style.display = "block";
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
      this.moveKnob(0, 0);
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      let dx = e.clientX - this.joyCenter.x;
      let dy = e.clientY - this.joyCenter.y;
      const d = Math.hypot(dx, dy);
      if (d > this.RADIUS) {
        dx = (dx / d) * this.RADIUS;
        dy = (dy / d) * this.RADIUS;
      }
      this.moveKnob(dx, dy);
      if (d > 8) {
        this.state.vector = { x: dx / this.RADIUS, y: dy / this.RADIUS };
      }
    });
    const endJoy = (e: PointerEvent): void => {
      if (e.pointerId !== this.joyPointerId) return;
      this.joyPointerId = null;
      this.stickBase.style.display = "none";
      // keep the last vector — the worm keeps its heading (feels right)
    };
    zone.addEventListener("pointerup", endJoy);
    zone.addEventListener("pointercancel", endJoy);

    const boostOn = (e: Event): void => {
      e.preventDefault();
      this.state.boost = true;
      boostBtn.classList.add("active");
    };
    const boostOff = (): void => {
      this.state.boost = false;
      boostBtn.classList.remove("active");
    };
    boostBtn.addEventListener("pointerdown", boostOn);
    boostBtn.addEventListener("pointerup", boostOff);
    boostBtn.addEventListener("pointercancel", boostOff);
    boostBtn.addEventListener("pointerleave", boostOff);
  }

  private moveKnob(dx: number, dy: number): void {
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  destroy(): void {
    this.root.remove();
  }
}
