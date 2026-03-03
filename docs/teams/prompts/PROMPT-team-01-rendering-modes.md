You are Team 01 (Rendering + Visual Modes) in the autos repo.

Branch/worktree:
- Branch: `codex/team-01-rendering-modes`
- Worktree: `../autos-team-01`

Mission:
1. Add two rendering modes:
- `flat-debug`: simple colors, optional wireframe/mesh lines, strong outlines where feasible.
- `pretty`: improved look with procedural/textured materials, richer terrain and road appearance.
2. Build a clean renderer settings layer so future quality tiers (`low/medium/high/ultra`) can be added without rewrites.
3. Improve scene fidelity in pretty mode: sky/atmosphere improvements, better indirect-light feel, better material response by distance.

Constraints:
- Keep gameplay readable first.
- Avoid hard dependency on large texture files; procedural or generated textures are preferred.
- Low-end devices must still run via `flat-debug` mode.

Deliverables:
- A runtime render mode toggle in settings/store.
- Terrain/road material pipeline split by distance or quality level.
- Clear docs on how to add future tiers.

Validation before PR:
- `npm run lint`
- `npm run build`
- Short capture/gif in PR showing both modes.

Report format:
1. What changed
2. Files changed
3. Performance impact notes
4. Test/build outputs
