# Team 05 Charter: Merge + Integration Agent

## Mission
Own branch hygiene, integration sequencing, conflict resolution, and release-candidate quality gates so parallel team work lands reliably.

## Ownership
- Branch strategy and worktree policy.
- Integration PR pipeline and merge queue.
- Conflict resolution protocol.
- Cross-team contract checks.

## Worktree Model
Each team gets one long-lived integration branch and optional short-lived feature branches.

Recommended branch names:
- `codex/team-01-physics-destruction`
- `codex/team-02-worlds-maps-gravity`
- `codex/team-03-vehicle-builder`
- `codex/team-04-immersion-audio-visual`
- `codex/integration`

Example setup:
```bash
git worktree add ../autos-team-01 codex/team-01-physics-destruction
git worktree add ../autos-team-02 codex/team-02-worlds-maps-gravity
git worktree add ../autos-team-03 codex/team-03-vehicle-builder
git worktree add ../autos-team-04 codex/team-04-immersion-audio-visual
git worktree add ../autos-integration codex/integration
```

## Merge Policy
1. Teams merge features into their team branch only after local checks pass.
2. Merge agent rebases team branches on latest `main` daily.
3. Integration order (default):
   1) Team 01 Physics + Destruction
   2) Team 02 Worlds + Gravity
   3) Team 03 Vehicle Builder
   4) Team 04 Immersion
4. Merge agent opens/updates one rolling PR from `codex/integration` to `main`.

## Required Gates Before Integration Merge
- `npm run lint`
- `npm run build`
- Smoke-playtest checklist:
  - Drive on all active maps.
  - Trigger destruction states.
  - Load at least 2 custom vehicle builds.
  - Validate audio/visual feedback does not desync from events.

## Conflict Protocol
1. First resolve by honoring team ownership boundaries.
2. If boundary conflict exists, merge agent creates a short RFC issue with:
- conflicting files
- options
- chosen resolution
3. Apply minimal conflict fix on `codex/integration`.
4. Back-port necessary fixes to team branches to avoid recurring conflicts.

## Definition of Done
- `main` only receives tested, contract-compatible increments.
- Cross-team interfaces stay versioned and documented.
- Integration branch remains releasable at all times.

