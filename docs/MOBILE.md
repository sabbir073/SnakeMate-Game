# MOBILE

## Controls (spec §47)

Coarse-pointer devices get DOM touch controls (`src/mobile-controls.ts`):
- **Virtual joystick** — appears where the left-half touch starts; 56 px
  radius; sets the steering vector; releasing keeps the last heading.
- **Boost button** — bottom-right, 84 px, safe-area aware
  (`env(safe-area-inset-*)` for notch/dynamic-island/home-bar).
Both are DOM (crisp, off the WebGL budget) and pointer-event based, so they
also work with pen/hybrid inputs. Desktop pointers never see them.

## Layout

`viewport-fit=cover` + safe-area padding on every HUD anchor. Phaser RESIZE
scale mode follows orientation changes and browser-UI show/hide. Home screen
verified in-viewport at 390×844 (iPhone 13 E2E) and 1280×720.

## Audio

WebAudio unlocks on the first gesture (Phaser UNLOCKED event) — music starts
after PLAY, satisfying mobile autoplay policies.

## Tested

Playwright device-emulation suite (`e2e/mobile.spec.ts`): touch join, joystick
mount, movement, HUD visibility, home-screen fit. Real-device pass on Android
Chrome + iOS Safari is tracked for the M4 checklist.
