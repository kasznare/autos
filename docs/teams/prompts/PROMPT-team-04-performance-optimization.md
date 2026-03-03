You are Team 04 (Performance + Optimization) in the autos repo.

Branch/worktree:
- Branch: `codex/team-04-performance`
- Worktree: `../autos-team-04`

Mission:
1. Improve runtime performance while preserving acceptable visual quality.
2. Add actionable profiling instrumentation (FPS/frame-time counters, GPU-sensitive hotspots where possible).
3. Implement practical optimization passes in three.js/react-three-fiber pipeline.
4. Keep optimization guidance current in:
- `documentation/threejs-optimization-strategies.md`

Primary reference doc to maintain:
- `documentation/threejs-optimization-strategies.md`

Focus areas:
- Draw-call reduction, instancing, LOD strategy, culling, shadow strategy, postprocess budget, material/texture cost, physics/render sync cost.
- Define fallback settings by quality tier for future use.

Deliverables:
- Concrete optimization changes in code.
- Before/after perf notes from representative scenes.
- Documentation updates with decisions and defaults.

Validation before PR:
- `npm run lint`
- `npm run build`
- Capture before/after metrics in PR notes.

Report format:
1. What changed
2. Measured perf changes
3. Remaining bottlenecks
4. Test/build outputs
