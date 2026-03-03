# Three.js Optimization Strategies (Autos)

This document is the shared optimization baseline for all teams.

## 1. Rendering Budget Targets
- Target frame time:
  - 60 FPS mode: <= 16.7ms total/frame
  - 30 FPS fallback: <= 33.3ms total/frame
- Keep a default GPU budget for mid-tier laptop iGPU.
- Define quality presets as bundles, not individual random toggles.

## 2. Biggest Wins First
1. Reduce draw calls (instancing, merged static geometry).
2. Reduce overdraw (alpha-heavy effects, fullscreen passes).
3. Reduce expensive shadows/lights.
4. Reduce fragment cost from complex materials.
5. Reduce per-frame JS allocations in hot paths.

## 3. Geometry and Draw Calls
- Use `InstancedMesh` for repeated props (trees, cones, rocks, lane markers).
- Merge static meshes per zone/map chunk when interaction is not needed.
- Split world into chunks; load/update only nearby chunks.
- Use low-poly collision proxies separate from render meshes.

## 4. LOD and Distance Strategy
- Use LOD tiers by distance for terrain detail, props, and traffic models.
- Disable tiny far objects completely when below screen-size threshold.
- Lower animation/update frequency for far entities (birds, traffic AI).
- Use material simplification at distance (fewer features, cheaper shading).

## 5. Materials, Textures, and Shading
- Prefer a small set of reusable materials.
- Keep shader variants low to avoid frequent program switches.
- Use procedural textures where possible to reduce memory churn.
- Avoid high-cost transparency; use dithered/alpha-tested alternatives when acceptable.
- Limit normal/parallax complexity in fast-moving gameplay camera mode.

## 6. Lighting and Shadows
- Keep dynamic shadow-casting lights minimal.
- Shadow quality tiers:
  - Low: shadows off or single cheap shadow map
  - Medium: one key light shadow with lower resolution
  - High/Ultra: selective additional shadows
- Restrict shadow distance and update rate.
- Bake or fake indirect light where possible.

## 7. Post-Processing Budget
- Make post stack optional and tiered.
- Avoid stacking multiple fullscreen passes on low/medium tiers.
- Gate expensive effects (SSAO, SSR, heavy bloom) behind high/ultra tiers.

## 8. Culling and Visibility
- Enable frustum culling wherever valid.
- Add coarse distance culling for map objects.
- Use occlusion-friendly map layout/chunking where practical.
- Do not render hidden debug helpers in production mode.

## 9. React Three Fiber / App-Level Patterns
- Keep `useFrame` handlers minimal and allocation-free.
- Reuse vectors/quaternions/matrices; avoid per-frame object creation.
- Use store selectors carefully to avoid broad rerenders.
- Memoize static scene subtrees.
- Prefer imperative updates for hot objects.

## 10. Physics + Render Coordination
- Keep collision meshes simple.
- Decouple physics step quality from render quality presets.
- Cap expensive collision checks with spatial partitioning.
- Reduce update frequency for non-critical rigid bodies.

## 11. Asset and Bundle Strategy
- Lazy-load optional systems (high-end effects, debug tools).
- Split chunks for garage/editor and gameplay where possible.
- Keep startup path minimal.

## 12. Profiling Workflow
- Always profile with same map, camera route, and spawn density.
- Record:
  - FPS average and 1% low
  - frame-time spikes
  - draw calls
  - triangles
  - GPU memory estimate (if available)
- Capture before/after for every optimization PR.

## 13. Team Integration Rules
- Any team adding visual complexity must provide:
  - expected perf impact
  - fallback behavior for low tier
  - knobs in shared quality settings
- No team should merge high-cost visuals without a low-cost fallback.
