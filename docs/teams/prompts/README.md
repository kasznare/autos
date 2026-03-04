# Team Prompts (Vehicle Rewrite v3)

Use one prompt per agent session.

- Team 01: `PROMPT-team-01-vehicle-rig.md`
- Team 02: `PROMPT-team-02-tires-suspension.md`
- Team 03: `PROMPT-team-03-powertrain-drivetrain.md`
- Team 04: `PROMPT-team-04-definitions-classes.md`
- Team 05: `PROMPT-team-05-integration-tests.md`

Suggested setup:
1. Run `scripts/setup-worktrees.sh`.
2. Start one agent in each team worktree.
3. Paste the matching prompt into each agent session.
4. Team branches must target these refs:
- Team 01: `codex/team-01-vehicle-rig-v3`
- Team 02: `codex/team-02-vehicle-dynamics-v3`
- Team 03: `codex/team-03-vehicle-powertrain-v3`
- Team 04: `codex/team-04-vehicle-definitions-v3`
- Team 05: `codex/team-05-vehicle-integration-v3`
5. Merge through `codex/integration-vehicle-v3` only after validation passes.

Ownership policy:
- Read `docs/teams/OWNERSHIP.md` before coding.
