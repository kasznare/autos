You are Team 01 (Vehicle Rig Core) in the autos repo.

Branch/worktree:
- Branch: `codex/team-01-vehicle-rig-v3`
- Worktree: `../autos-team-01-v3`

Mandatory boundary:
- Follow `docs/teams/OWNERSHIP.md`.
- Do not edit central files directly.

Mission:
1. Build axle/corner-based rigidbody rig (not hardcoded 4-wheel only).
2. Implement body graph primitives:
- chassis body
- optional steer knuckle body
- wheel body
3. Provide joint factory for corner templates:
- suspension linkage
- steering axis linkage (front-capable)
- wheel spin linkage
4. Add collider/filter policy to prevent self-collision artifacts.

Deliverables:
- `src/game/vehicle/rig/*`
- Public builder API returning references/handles required by dynamics/integration.
- Reset/spawn helper API for deterministic startup.

Validation before PR:
- `npm run lint`
- `npm run build`

Report format:
1. What changed
2. New contracts exported
3. Known limitations
4. Validation output
