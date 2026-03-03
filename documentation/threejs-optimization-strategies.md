# Three.js Optimization Strategies (Autos v2)

## Runtime Instrumentation (Implemented)

The runtime now publishes render profiling telemetry in the store and HUD:

- `fps`
- `frameMsAvg`
- `frameMsWorst`
- `drawCalls`
- `triangles`
- `gpuHotspot` (`none` | `draw-calls` | `geometry` | `particles`)
- `qualityTier` (`high` | `medium` | `low`)

Implementation modules:

- `src/game/systems/performance.ts`
- `src/game/scene/useRenderProfiler.ts`
- `src/game/domains/immersion/storeSlice.ts`
- `src/game/Hud.tsx`

## Quality Tiers (Implemented)

Tiering is centralized in `src/game/systems/performance.ts`.

### High

- DPR: `[1, 1.8]`
- Antialias: on
- Shadows: soft (`1024x1024` directional map)
- Environment/contact shadows: on
- Terrain segments: `280`
- Roadside density: `1.0`
- Traffic update: `50 Hz`
- Critter update: `45 Hz`

### Medium

- DPR: `[0.95, 1.35]`
- Antialias: off
- Shadows: off (`512x512` reserved config)
- Environment/contact shadows: off
- Terrain segments: `180`
- Roadside density: `0.7`
- Traffic update: `35 Hz`
- Critter update: `25 Hz`

### Low

- DPR: `[0.75, 1.05]`
- Antialias: off
- Shadows: off (`256x256` reserved config)
- Environment/contact shadows: off
- Terrain segments: `120`
- Roadside density: `0.45`
- Traffic update: `25 Hz`
- Critter update: `16 Hz`

## Optimization Passes (Implemented)

### 1) Draw-call reduction via instancing

- `RoadsideDetails` moved from per-prop mesh render to two instanced batches (rocks + bushes).
- `Trees` moved from per-tree render meshes to instanced trunk/canopy render batches, while keeping per-tree physics colliders.

### 2) Tiered geometry budget

- `RoadPath` and `ProceduralGround` now use tier-dependent terrain segment counts.

### 3) Tiered simulation update budget

- Traffic kinematic movement is now stepped at tier-specific rates instead of every render frame.
- Critter motion updates are tier-stepped and distance-culled from player position.

### 4) Physics/render sync micro-optimization

- Critter hit checks in runtime switched from array includes to `Set` membership.

## Before/After Perf Notes (Representative)

These notes use deterministic scene-structure changes and runtime counters now shown in HUD.

### Procedural path map

- Roadside details draw calls:
  - Before: up to ~180 draw calls (1 per detail mesh)
  - After: 2 draw calls (instanced rocks + bushes)
- Tree render draw calls:
  - Before: ~2 per tree mesh group
  - After: 3 draw calls total for all tree visuals (instanced trunk + 2 canopy variants)
- Terrain tessellation:
  - Before: fixed 280 segments
  - After: 280 / 180 / 120 by quality tier

### Ring maps

- Roadside details draw calls:
  - Before: up to ~70 draw calls
  - After: 2 draw calls
- Shadow/environment cost:
  - Before: tied only to low-power mode
  - After: explicitly controlled by quality tier policy

## Remaining Bottlenecks

- Vehicle meshes (player/traffic/remote) are still multi-mesh and non-instanced.
- Fixed collider counts still dominate some CPU cost in dense maps.
- Bundle chunk size warning still exists; gameplay vs garage code splitting is still pending.

## Profiling Workflow

1. Run same route on `orbital` and `procedural` maps for 30-60s.
2. Capture HUD telemetry: FPS, avg/worst frame ms, draws, tris, hotspot, tier.
3. Record low/medium/high tier behavior separately.
4. Include these numbers in PR notes for every visual/system perf change.
