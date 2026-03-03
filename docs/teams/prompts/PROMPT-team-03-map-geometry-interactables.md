You are Team 03 (Maps + Geometry + Interactables) in the autos repo.

Branch/worktree:
- Branch: `codex/team-03-map-geometry-interactables`
- Worktree: `../autos-team-03`

Mission:
1. Expand map scale and geometric detail (larger playable spaces, better verticality/structure).
2. Move map selection UX to HUD (not garage).
3. Add layered world geometry and meaningful interactable objects with colliders where appropriate.
4. Add lane-aware road geometry (visual lanes + geometry alignment).
5. Add environmental world elements (sun/clouds/birds etc.) as world objects owned by map system.

Important scope boundary:
- Focus on geometry/layout/object placement and collision relevance.
- Do not focus on final textures/material polish (that belongs to Team 01).

Deliverables:
- At least 2 expanded maps with denser geometry and interactables.
- Collider policy: which objects collide and why.
- HUD map selector flow finalized and garage map selector removed.
- Updated map schema/docs for new geometry/object layers.

Validation before PR:
- `npm run lint`
- `npm run build`
- Playtests proving map switching and collider behavior.

Report format:
1. What changed
2. Schema/contract changes
3. Collision coverage notes
4. Test/build outputs
