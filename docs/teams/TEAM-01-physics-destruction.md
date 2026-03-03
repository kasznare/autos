# Team 01 Charter: Physics + Destruction

## Mission
Build a robust, tunable vehicle physics and destruction stack that feels impactful, remains stable at frame rate, and exposes clean interfaces for maps, car builds, and audio/visual systems.

## Why This Is One Team
Physics and destruction are tightly coupled:
- Destruction quality depends on collision impulse quality.
- Collision tuning depends on mass, inertia, and material setup.
- Both must share one performance budget and one telemetry pipeline.

Splitting early would create constant interface churn and merge friction.

## Ownership
- `src/game/world.ts`
- `src/game/PlayerCar.tsx`
- `src/game/GameScene.tsx` (physics/destruction integration points only)
- `src/game/types.ts` (physics/destruction type contracts)
- New folder: `src/game/physics/` (new submodules)

## Deliverables
1. Deterministic-ish physics profile by gameplay mode (arcade, heavy, low-grip).
2. Material-based collision response table (metal/rock/wood/etc.).
3. Damage pipeline v2:
- Impact energy classification.
- Localized part damage zones.
- Progressive visual destruction states.
4. Destruction event bus for consumers (VFX/SFX/HUD).
5. Debug telemetry overlay (impulse, speed, slip, damage deltas).

## Contracts to Other Teams
- Expose world gravity vector and active environment modifiers as read-only inputs.
- Expose car physical parameters via a typed `VehicleSpec`.
- Emit stable destruction events:
  - `impact`
  - `damage_applied`
  - `part_state_changed`
  - `vehicle_disabled`

## Non-Goals
- Final art polish.
- Career/progression economy.
- Map art kit production.

## Milestones
1. Baseline telemetry + profile toggles.
2. Damage model refactor and part-zone support.
3. Destruction event bus + integration with VFX/SFX hooks.
4. Performance pass and regression tests.

## Definition of Done
- No new critical instability (flip jitter, tunneling, NaN explosions) in regression scenarios.
- Average frame time overhead from physics/destruction stays within agreed budget.
- API contracts documented and consumed by at least one other team without local patches.

