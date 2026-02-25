# 3D Kids Car Game Roadmap

## Phase 1 - Foundation (Done)
- [x] Scaffold React + TypeScript project with Vite
- [x] Add 3D stack: R3F, Drei, Rapier, Zustand
- [x] Set up world scene, lighting, camera follow, and controls

## Phase 2 - MVP Gameplay (Done)
- [x] Player car movement (keyboard)
- [x] Collision-based damage model with cooldown
- [x] Damage tiers: low/medium/high
- [x] Lose state at max damage
- [x] One-click/key restart flow
- [x] Damage bar + score + best score HUD
- [x] Damage color transitions on the car
- [x] Repair pickups and score pickups

## Phase 3 - MVP Polish (Next)
- [ ] Add touch controls for tablet play
- [ ] Replace placeholder meshes with low-poly assets
- [ ] Add stronger crash feedback (screen shake, sound, particle burst)
- [ ] Add simple game audio and mute toggle
- [ ] Tune obstacle layout + difficulty presets

## Phase 4 - Post-MVP Features
- [ ] Car part detach system (bumper/door variants)
- [ ] Extra game modes (timed run, star challenge)
- [ ] Parent settings panel (session cap, difficulty lock)
- [ ] Save profile progress locally

## Technical Notes
- Current build is offline-only and has no external services.
- Loss flow is intentionally soft for younger players ("Pit Stop Time!").
- Gameplay state is centralized in Zustand for easy extension.
