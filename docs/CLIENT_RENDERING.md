# CLIENT RENDERING

## Stack

Phaser 3 (WebGL, RESIZE scale mode) + DOM overlay for all text UI (HUD,
leaderboard, death screen, menus). DOM text stays crisp at every DPI and off
the WebGL frame budget; per CLAUDE.md, dynamic text is never baked into canvas.

## Local worm — prediction (spec §26)

`LocalPredictor` (src/prediction.ts) runs the exact game-core movement code at
fixed 1/60 dt via an accumulator. Per fixed step: sample pointer → input
{seq, angle, boost} → apply locally → buffer → send. On every authoritative
update: rewind to server state, drop acked inputs (lastInputSeq), replay the
rest, and fold the residual into a decaying render offset (~90 ms half-life;
hard snap only beyond 400 wu). Measured: <20 wu error locally, <120 wu at
simulated 150 ms RTT (E2E-enforced bounds).

## Remote worms — interpolation (spec §27)

`SnapshotBuffer` (src/interpolation.ts) timestamps incoming states and renders
at now − 75 ms (1.5 snapshot intervals), lerping position and shortest-arc
angle between surrounding snapshots; late snapshots hold the newest (no
unbounded extrapolation).

## Bodies

`WormRenderer` reconstructs bodies render-side with follow-the-leader segment
constraints (segment spacing 16 wu, radius taper toward tail). M1 look is
procedural vector (Graphics); M2 swaps in skinned atlas sprites without
touching the motion pipeline.

## Food

Single Graphics redrawn per frame with camera-view culling (+40 wu pad).
M2: pooled sprites from the food atlas.

## Fixed-timestep render interpolation

The predictor stores the pose at the previous fixed step and `renderPose()`
lerps prev→current by `accumulator/dt`. Without this, a 60 Hz sim beats
against the display refresh (frames alternately advance 0 or 2 steps) and the
worm visibly hitches on a ~1 s cycle. Reconciliation shifts the interpolation
base rigidly so corrections stay inside the error-offset smoothing.
`e2e/smoothness.spec.ts` enforces a low coefficient of variation on rendered
speed.

## Camera (spec §23)

Exponential follow (90 ms half-life) + eased mass-based zoom-out
(zoom = (10/mass)^0.12, floor 0.55) + the ZOOM powerup's eased wide-view
factor. On top of that, an INSTANT view-area normalization scales zoom by
max(canvasW/1500, canvasH/850): the visible world area is constant no matter
the window size or browser zoom, so zooming out reveals nothing (anti-cheat —
E2E-enforced). Ctrl+wheel/±/pinch are also suppressed.

## Network simulation (spec §53)

`?fakeLag=N` delays inputs and state application N/2 ms each way — used by the
latency E2E and manual testing. Dev-only; the server never trusts client
timing.

## Test hook

`window.__nibblio` exposes read-only diagnostics (alive/mass/score/
remoteCount/foodCount/predictionError/pendingInputs/position) consumed by
Playwright and, in M3, the dev perf panel.
