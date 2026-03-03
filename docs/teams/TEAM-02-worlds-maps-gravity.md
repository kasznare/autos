# Team 02 Charter: Worlds, Maps, Gravity

## Mission
Create memorable, replayable maps (including planet themes) with meaningful terrain and gravity variation, while staying compatible with the core physics contract.

## Ownership
- `src/game/maps.ts`
- `src/game/world.ts` (environment parameter wiring only)
- New folder: `src/game/maps/` (map data, biome presets, gravity profiles)
- Map-related assets under `public/` and `src/assets/` (map scope only)

## Deliverables
1. Map schema v2:
- Terrain profile.
- Gravity vector and magnitude.
- Surface material zones.
- Hazard and pickup spawn rules.
2. At least 3 planet map prototypes:
- Low gravity, high verticality.
- Normal gravity, technical corners.
- High gravity, heavy-braking routes.
3. Elevation-focused race lines with gameplay-readable layout.
4. Validation tooling for map config correctness.

## Contracts to Other Teams
- Consume physics API only via public contracts (`VehicleSpec`, gravity/environment inputs).
- Publish map/environment config as versioned data schema.
- No direct edits to Team 01 internals without cross-team RFC.

## Non-Goals
- Vehicle handling internals.
- Custom car builder UX.
- Audio mixing implementation.

## Milestones
1. Data schema and map loader refactor.
2. Planet gravity prototypes and traversal validation.
3. Spawn/hazard pass and difficulty balancing.
4. Optimization and playtest iteration.

## Definition of Done
- Each map passes schema validation and smoke tests.
- Gravity and terrain changes produce intended gameplay differences.
- No map requires ad-hoc physics code patches to function.

