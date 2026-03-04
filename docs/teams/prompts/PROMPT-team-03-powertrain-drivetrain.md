You are Team 03 (Powertrain + Drivetrain) in the autos repo.

Branch/worktree:
- Branch: `codex/team-03-vehicle-powertrain-v3`
- Worktree: `../autos-team-03-v3`

Mandatory boundary:
- Follow `docs/teams/OWNERSHIP.md`.
- No direct edits to gameplay central files.

Mission:
1. Build powertrain abstraction:
- ICE model (torque curve + engine braking hooks)
- EV model (instant torque + regen hooks)
2. Build drivetrain abstraction:
- FWD/RWD/AWD torque routing
- differential policy (open + locked baseline)
3. Add braking torque split model (front/rear bias).
4. Export clean interfaces for integration layer to consume.

Deliverables:
- `src/game/vehicle/powertrain/*`
- `src/game/vehicle/drivetrain/*`
- Contract docs/examples for FWD/RWD/AWD + ICE/EV combinations.

Validation before PR:
- `npm run lint`
- `npm run build`
- Unit-like deterministic checks for torque split correctness.

Report format:
1. What changed
2. Supported drivetrain/powertrain matrix
3. Edge cases
4. Validation output
