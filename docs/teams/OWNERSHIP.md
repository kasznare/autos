# Team Ownership and Integration Rules (v3 Vehicle Rewrite)

Purpose: ship a detailed non-raycast vehicle model with minimal merge conflicts.

## Branches
- Team 01 (Rig): `codex/team-01-vehicle-rig-v3`
- Team 02 (Tires/Suspension): `codex/team-02-vehicle-dynamics-v3`
- Team 03 (Powertrain/Drivetrain): `codex/team-03-vehicle-powertrain-v3`
- Team 04 (Definitions/Classes): `codex/team-04-vehicle-definitions-v3`
- Team 05 (Integration/Tests): `codex/team-05-vehicle-integration-v3`
- Integration: `codex/integration-vehicle-v3`

## Central Files (Integration-Owned)
Do not edit directly from team branches unless explicitly approved by integration:
- `src/App.tsx`
- `src/game/GameScene.tsx`
- `src/game/PlayerCar.tsx`
- `src/game/Hud.tsx`
- `src/game/store.ts`
- `src/game/store/*` (except additive type-safe extensions requested by Team 05)

## Team Module Ownership
- Team 01 (Rig)
- `src/game/vehicle/rig/*`
- `src/game/vehicle/common/*` (rig-related shared types only)

- Team 02 (Tires/Suspension)
- `src/game/vehicle/dynamics/*`
- `src/game/vehicle/tire/*`
- `src/game/vehicle/suspension/*`

- Team 03 (Powertrain/Drivetrain)
- `src/game/vehicle/powertrain/*`
- `src/game/vehicle/drivetrain/*`

- Team 04 (Definitions/Classes)
- `src/game/vehicle/definitions/*`
- `src/game/vehicle/schema/*`

- Team 05 (Integration/Tests)
- `src/game/vehicle/integration/*`
- `scripts/physics-*.ts`
- `scripts/physics-*.mjs`
- adapter/wiring changes needed to toggle v1/v2 vehicle model behind feature flags

## Cross-Team Interface Rules
- Prefer additive interfaces and explicit contracts in `src/game/vehicle/common/contracts.ts`.
- Do not import across team modules through deep private paths; import via public index files.
- If you need another team's in-progress interface, define a temporary local adapter and mark TODO with branch reference.

## Merge Policy
1. Team branches merge into `codex/integration-vehicle-v3` only.
2. Integration resolves conflicts and runs full validation.
3. Only integration merges to `main`.

## Required Validation
- `npm run lint`
- `npm run build`
- `npm run physics:bounce`
- `npm run physics:runtime`

## PR Requirements
- Include changed file list.
- Call out any central-file edits and why they were unavoidable.
- Include before/after behavior notes for stability-sensitive changes.
