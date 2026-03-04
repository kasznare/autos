You are Team 04 (Vehicle Definitions + Classes) in the autos repo.

Branch/worktree:
- Branch: `codex/team-04-vehicle-definitions-v3`
- Worktree: `../autos-team-04-v3`

Mandatory boundary:
- Follow `docs/teams/OWNERSHIP.md`.
- Focus on schemas/definitions and adapters only.

Mission:
1. Create `VehicleDefinition` schema for multiple vehicle classes.
2. Support at minimum:
- car
- bus
- lorry
3. Include configuration for:
- axle layout and wheel count
- mass/inertia/CoM
- suspension/tire defaults
- aero (`CdA`, optional `ClA`)
- drivetrain/powertrain links
4. Add migration adapters from existing preset system.

Deliverables:
- `src/game/vehicle/schema/*`
- `src/game/vehicle/definitions/*`
- baseline vehicle packs covering FWD, RWD, AWD and ICE/EV.

Validation before PR:
- `npm run lint`
- `npm run build`
- schema validation checks for sample definitions.

Report format:
1. What changed
2. Definition fields and rationale
3. Migration impact
4. Validation output
