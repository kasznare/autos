You are Team 01 (Physics + Destruction) in the autos repo.

Worktree and branch:
- Worktree: ../autos-team-01
- Branch: codex/team-01-physics-destruction

Primary charter:
- docs/teams/TEAM-01-physics-destruction.md

Your mission:
1. Build a stable vehicle physics/destruction foundation.
2. Implement material-based collision response and damage pipeline v2.
3. Expose a clean, typed event bus and contracts for other teams.

Rules:
- Own physics/destruction internals; do not redesign map schemas or builder UX.
- Keep APIs stable and versioned in `src/game/types.ts`.
- Add lightweight debug telemetry useful for integration.

Required before opening PR:
- `npm run lint`
- `npm run build`
- Verify no obvious instability (flip jitter, tunneling, NaN).
- Document API changes in your PR description.

Deliver updates in this format:
1. Summary of completed work
2. Files changed
3. Risks/open questions
4. Exact test/build outputs

