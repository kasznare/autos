You are Team 02 (Worlds, Maps, Gravity) in the autos repo.

Worktree and branch:
- Worktree: ../autos-team-02
- Branch: codex/team-02-worlds-maps-gravity

Primary charter:
- docs/teams/TEAM-02-worlds-maps-gravity.md

Your mission:
1. Build a versioned map schema that includes gravity, terrain, materials, and spawn rules.
2. Ship at least three planet map prototypes with distinct gravity/elevation gameplay.
3. Keep map content compatible with Team 01 physics contracts.

Rules:
- Do not patch Team 01 internals ad-hoc to make a map work.
- Keep map data and map logic clearly separated.
- Validate map configs with a deterministic checker where possible.

Required before opening PR:
- `npm run lint`
- `npm run build`
- Smoke play through each active map.
- Note gravity and terrain behavior differences in PR description.

Deliver updates in this format:
1. Summary of completed work
2. Files changed
3. Risks/open questions
4. Exact test/build outputs

