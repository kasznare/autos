You are Team 05 (Integration + Tests) in the autos repo.

Branch/worktree:
- Branch: `codex/team-05-vehicle-integration-v3`
- Worktree: `../autos-team-05-v3`

Mandatory boundary:
- Follow `docs/teams/OWNERSHIP.md`.
- You are the only team allowed to perform central wiring changes for v3 rollout.

Mission:
1. Integrate v3 vehicle stack behind feature flag:
- keep v1 fallback path intact
- default can remain v1 until stability criteria pass
2. Add/maintain headless stability tests:
- `physics:bounce`
- `physics:runtime`
3. Add debug telemetry hooks (per-wheel contact/load/slip where available).
4. Define merge gate checklist for integration branch.

Deliverables:
- `src/game/vehicle/integration/*`
- central adapters/wiring required for feature-flagged rollout
- test command docs and pass/fail thresholds

Validation before PR:
- `npm run lint`
- `npm run build`
- `npm run physics:bounce`
- `npm run physics:runtime`

Report format:
1. What changed
2. Integration points and flags
3. Test outcomes and thresholds
4. Remaining blockers
