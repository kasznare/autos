# Rendering Modes and Quality Tiers

## Runtime Controls
Render settings are available in Garage > Run Settings:
- `Render Mode`
  - `Flat Debug` (`flat-debug`): readability-first, simple materials, optional wireframe.
  - `Pretty` (`pretty`): richer procedural materials and distance-based detail.
- `Render Tier`
  - `low`, `medium`, `high`, `ultra`
- `Wireframe`
  - available only in `flat-debug`.

## Architecture
Central render policy is in:
- [src/game/render/settings.ts](/Users/kasznarandras/Code/autos-team-01-v2/src/game/render/settings.ts)

Runtime resolution flow:
1. Store persists user choice in the immersion UI slice.
2. `useRenderSettings()` resolves mode + tier + battery saver into effective render settings.
3. Scene material components consume resolved settings without changing gameplay systems.

## Terrain/Road Pipeline
- Terrain and roads use procedural canvas textures only.
- In `pretty` mode:
  - Near and far texture variants are generated.
  - Material map/roughness switches by camera distance.
  - Terrain tessellation scales by quality tier.
- In `flat-debug` mode:
  - Solid high-contrast materials for readability.
  - Optional wireframe overlays through material wireframe.

## Extending Future Tiers
To add a tier:
1. Extend `RenderQualityTier` in [src/game/store/types.ts](/Users/kasznarandras/Code/autos-team-01-v2/src/game/store/types.ts).
2. Add tier values in `TIER_CONFIGS` in [src/game/render/settings.ts](/Users/kasznarandras/Code/autos-team-01-v2/src/game/render/settings.ts).
3. Add tier button in [src/game/ui/builder/GarageOverlay.tsx](/Users/kasznarandras/Code/autos-team-01-v2/src/game/ui/builder/GarageOverlay.tsx).

## Adding New Modes
1. Extend `RenderMode` in [src/game/store/types.ts](/Users/kasznarandras/Code/autos-team-01-v2/src/game/store/types.ts).
2. Add mode branch in `resolveRenderSettings`.
3. Apply mode behavior in scene components:
   - [src/game/scene/terrain.tsx](/Users/kasznarandras/Code/autos-team-01-v2/src/game/scene/terrain.tsx)
   - [src/game/scene/entities.tsx](/Users/kasznarandras/Code/autos-team-01-v2/src/game/scene/entities.tsx)
   - [src/game/CarModel.tsx](/Users/kasznarandras/Code/autos-team-01-v2/src/game/CarModel.tsx)
