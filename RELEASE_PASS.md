# Release Pass — Running Log

Active branch: `claude/nifty-fermat-wsmwml`
Session: https://claude.ai/code/session_01UY8VuKQkGwEmRFAMiP71kK

This file is the persistent task log for the pre-release quality pass.
Cross-repo source of truth is in `emptysock-engine/RELEASE_PASS.md`.
Update this file after any fix in this repo.

---

## Status key

- [x] Fixed and pushed
- [ ] Open / not started
- [~] Partial / needs verification

---

## Fixes in this repo (`emptysock-mcp`)

- [x] **`src/tests/tools.test.ts`** — Particle tests updated from removed `maxParticles` field to `emissionRate`/`lifetimeMin`/`lifetimeMax`.
- [x] **`src/tests/tools.test.ts`** — `physics_raycast_3d` test updated to assert the tool is not registered (tool was removed).

## Remaining open items

None identified. See `emptysock-engine/RELEASE_PASS.md` for full cross-repo list.
