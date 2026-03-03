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
4. Merge only after each team passes `npm run lint` and `npm run build`.
