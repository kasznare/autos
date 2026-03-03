# Team 03 Charter: Vehicle Builds + Custom Builder

## Mission
Design and implement a flexible vehicle build system and builder interface so players can create cars with distinct size, performance, and style characteristics, while preserving fair gameplay envelopes.

## Ownership
- `src/game/config.ts` (vehicle tuning defaults and limits)
- `src/game/store.ts` (build persistence and selected config state)
- `src/game/types.ts` (vehicle build types)
- UI entry points in `src/App.tsx` and new `src/game/ui/builder/`
- Optional model wiring in `src/game/CarModel.tsx`

## Deliverables
1. `VehicleSpec` schema:
- Chassis size.
- Mass class.
- Power and top speed profile.
- Handling traits (grip, drift tendency, brake strength).
- Cosmetic selections.
2. Builder UI:
- Preset templates and custom sliders.
- Real-time stat preview and tradeoff indicators.
- Save/load local builds.
3. Constraints system:
- Hard limits to prevent broken builds.
- Optional class buckets for future matchmaking.
4. Integration with physics system through typed adapters.

## Contracts to Other Teams
- Physics team defines authoritative low-level parameter bounds.
- Builder publishes sanitized `VehicleSpec` only; no direct runtime hacks.
- Immersion team consumes build metadata for VFX/SFX variation.

## Non-Goals
- Planet map design.
- Core destruction algorithm ownership.
- Final cinematic UI polish.

## Milestones
1. Data model and serialization.
2. Builder UI MVP and preset system.
3. Physics adapter integration and balancing pass.
4. UX polish and validation tests.

## Definition of Done
- New builds can be created, saved, loaded, and driven end-to-end.
- Invalid specs are blocked with clear UI feedback.
- Build changes are reflected in gameplay without code changes per build.

