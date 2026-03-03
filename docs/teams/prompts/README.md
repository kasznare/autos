# Team Prompts (Current Sprint)

Use one prompt per agent session.

- Team 01: `PROMPT-team-01-rendering-modes.md`
- Team 02: `PROMPT-team-02-physics-collision-jump.md`
- Team 03: `PROMPT-team-03-map-geometry-interactables.md`
- Team 04: `PROMPT-team-04-performance-optimization.md`

Suggested setup:
1. Run `scripts/setup-worktrees.sh` (or create equivalent worktrees manually).
2. Start one agent in each team worktree.
3. Paste the matching prompt into each agent session.
4. Team branches must target these refs:
- Team 01: `codex/team-01-rendering-modes-v2`
- Team 02: `codex/team-02-physics-collision-jump-v2`
- Team 03: `codex/team-03-map-geometry-interactables-v2`
- Team 04: `codex/team-04-performance-v2`
5. Merge through `codex/integration-v2` only after each team passes `npm run lint` and `npm run build`.

Ownership policy:
- See `docs/teams/OWNERSHIP.md` before coding.
