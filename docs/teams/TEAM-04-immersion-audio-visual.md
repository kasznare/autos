# Team 04 Charter: Immersion, Visual Design, Sound Design

## Mission
Increase player immersion through cohesive visual language, responsive effects, and adaptive sound that reflects physics, destruction, terrain, and vehicle build identity.

## Ownership
- `src/game/sfx.ts`
- `public/audio/` (new SFX/music assets and mixes)
- `src/game/Hud.tsx` (readability and feedback layering)
- `src/game/GameScene.tsx` (visual/sound event hookup points)
- Styling updates in `src/App.css` and `src/index.css` where needed

## Deliverables
1. Audio system v2:
- Layered engine sound response to RPM/load/slip.
- Destruction and surface-specific impact sounds.
- Ambient per-map audio beds.
2. Visual feedback:
- Improved crash/destruction effects.
- Planet-specific atmosphere and lighting presets.
- Better readability for speed, damage, and traction feedback.
3. Immersion playbook:
- Style guide for color, tone, and effects intensity.
- Accessibility pass for key gameplay indicators.

## Contracts to Other Teams
- Subscribe to Team 01 destruction/physics events only through public event bus.
- Read map metadata from Team 02 schema (biome, gravity, surface zones).
- Read vehicle metadata from Team 03 `VehicleSpec` for style/audio variants.

## Non-Goals
- Rewriting physics internals.
- Designing map collision meshes.
- Owning progression economy.

## Milestones
1. Event-driven audio refactor.
2. Crash and environment VFX pass.
3. HUD/readability and accessibility adjustments.
4. Performance optimization and final mix tuning.

## Definition of Done
- Audio and visual response clearly reflect gameplay state changes.
- No critical performance regressions from immersion features.
- Style guide exists and is followed by all new immersion contributions.

