# Example Baton Pass

This is what a completed `baton-pass` looks like when it includes a real dragon-dance entry.
Dragon dance is not required every time — it appears here because there was a real lesson.

---

## Turn State
- State: handed-off
- Last Move: baton-pass
- Last Agent: codex
- Next Agent: claude
- Updated At: 2026-04-17

## Goal
Add trusted-origin protection and a compatible CSP before production deployment.

## Completed
- Added trusted-origin enforcement for non-GET API writes.
- Added backend and frontend CSP headers.
- Updated verification scripts to test forged cross-origin writes.
- Synced deployment and handoff docs.

## Files Changed
- `backend/src/middleware/verifyTrustedOrigin.js`
- `backend/src/createApp.js`
- `backend/src/middleware/securityHeaders.js`
- `determinext/next.config.ts`
- handoff docs

## Verified
- backend smoke: passed
- backend lifecycle verification: passed
- demo verification: passed
- lint: passed
- build: passed outside sandbox
- E2E: passed

## Risks
- Hosted verification still matters because production origin matching must be exact.
- CSP is broad enough to pass the build but may need tightening once inline styles are audited.

## Next Task
Deploy to the real frontend and backend hosts, then run the hosted smoke pass.

## Dragon Dance

**Problem:** Verification scripts originally hit an HTML CORS failure before the new origin middleware could return a JSON rejection.

**Impact:** Tests failed noisily and hid the real security behavior we wanted to verify.

**Improvement:** Standardize that origin-rejection tests should allow middleware-owned JSON responses instead of letting CORS throw first.

**New Convention:** When adding request-boundary middleware, verify that the test harness matches browser behavior and that failure responses stay machine-readable.
