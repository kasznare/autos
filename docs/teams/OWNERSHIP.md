# Team Ownership and Integration Rules (v2)

Purpose: prevent merge conflicts and central-file churn by keeping each team in bounded modules.

## Branches
- Team 01: `codex/team-01-rendering-modes-v2`
- Team 02: `codex/team-02-physics-collision-jump-v2`
- Team 03: `codex/team-03-map-geometry-interactables-v2`
- Team 04: `codex/team-04-performance-v2`
- Integration: `codex/integration-v2`

## Central Files (Integration-Owned)
These files are integration-owned and should not be edited directly by team branches unless there is explicit integration approval:
- `src/App.tsx`
- `src/game/GameScene.tsx`
- `src/game/PlayerCar.tsx`
- `src/game/Hud.tsx`
- `src/game/store.ts`

## Team Module Ownership
- Team 01 (Rendering):
  - `src/game/scene/terrain.tsx`
  - rendering-specific modules under `src/game/scene/` and new rendering folders
  - rendering-related CSS variables and visual-mode settings
- Team 02 (Physics/Collision/Jump):
  - `src/game/systems/player-car/*`
  - `src/game/physics/*`
  - input plumbing modules (not central HUD/App orchestration)
- Team 03 (Maps/Geometry/Objects):
  - `src/game/maps/*`
  - world object/entity map modules
  - map schema, validation, and placement logic
- Team 04 (Performance):
  - optimization utilities and instrumentation modules
  - docs in `documentation/`
  - non-invasive performance improvements in owned modules

## Cross-Team Interface Rule
- Prefer adding/extending interfaces in modular files (`types`, slice contracts, adapters).
- If a cross-team change requires central file edits, open a small integration PR or hand off to integration branch.

## Merge Policy
1. Team branches merge into `codex/integration-v2`.
2. Integration resolves conflicts and performs system-level validation.
3. Only integration merges to `main`.

## Required Validation
- `npm run lint`
- `npm run build`
- Include changed file list in PR description.
- Explicitly call out any central-file edits and why they were needed.
