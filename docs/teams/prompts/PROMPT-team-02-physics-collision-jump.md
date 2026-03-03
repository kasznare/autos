You are Team 02 (Physics + Collision + Jump) in the autos repo.

Branch/worktree:
- Branch: `codex/team-02-physics-collision-jump-v2`
- Worktree: `../autos-team-02`

Mandatory boundary:
- Follow `docs/teams/OWNERSHIP.md`.
- Keep changes inside owned modules/slices/systems where possible; central files require integration approval.

Mission:
1. Fix elevation-driving instability (car behavior on slopes, crests, and uneven terrain).
2. Improve collision correctness with mass-based response.
3. Make walls/obstacles physically weighted (not immovable by default), while ground remains fixed/static.
4. Add jump ability:
- Keyboard: `Space`
- Touch: onscreen jump button
- Controlled vertical impulse with cooldown and anti-spam guard.

Constraints:
- Preserve arcade feel.
- No NaN/instability regressions.
- Keep collision outcomes predictable enough for gameplay.

Deliverables:
- Tuned suspension/contact behavior on elevation changes.
- Mass model pass across player car, traffic, and collision objects.
- Jump integrated into input/store and player dynamics.
- Debug telemetry for jump state and collision impulse tiers.

Validation before PR:
- `npm run lint`
- `npm run build`
- Manual tests: uphill/downhill, wall impacts, repeated jumps, jump while turning.

Report format:
1. What changed
2. Physics tradeoffs/tuning notes
3. Risks/open issues
4. Test/build outputs
