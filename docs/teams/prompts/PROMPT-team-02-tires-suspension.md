You are Team 02 (Tire + Suspension Dynamics) in the autos repo.

Branch/worktree:
- Branch: `codex/team-02-vehicle-dynamics-v3`
- Worktree: `../autos-team-02-v3`

Mandatory boundary:
- Follow `docs/teams/OWNERSHIP.md`.
- Keep changes inside vehicle dynamics modules.

Mission:
1. Implement per-wheel slip decomposition (longitudinal/lateral).
2. Implement tire force model with load sensitivity and force clamping.
3. Implement suspension travel/compression model with bump/rebound limits.
4. Implement anti-roll bar coupling per axle.
5. Remove assumptions of direct chassis propulsion in dynamic calculations.

Deliverables:
- `src/game/vehicle/tire/*`
- `src/game/vehicle/suspension/*`
- `src/game/vehicle/dynamics/*`
- Deterministic per-wheel telemetry output contract.

Validation before PR:
- `npm run lint`
- `npm run build`
- Add/update at least one physics smoke test proving reduced oscillation.

Report format:
1. What changed
2. Equations/model notes
3. Tuning defaults
4. Validation output
