# Consolidation
Gathered 100 open pull requests on 2026-11-17 onto one branch, `consolidation/all-open-changes`.
Everything below is a pull request that never reached main. They are all authored by the same account but produced by three bots that write under it: Sentinel (security), Bolt (performance) and Palette (interface), plus their Jules note files. The bots opened one branch per idea against whatever main looked like that day, so most of them no longer apply: the files moved, were renamed, or the bug was fixed by hand in the meantime.
## What this branch actually carries
4 changes applied cleanly and are committed here:
* #410 🛡️ Sentinel: Harden governance and ledger consensus inputs — 1 file(s), 45 changed lines
* #401 🛡️ Sentinel: [HIGH] Harden ClientManifestVerifier.ingestRevocationTicket() input — 2 file(s), 59 changed lines
* #382 ⚡ Bolt: Optimize verifier HMAC initialization — 2 file(s), 14 changed lines
* #347 🛡️ Sentinel: [CRITICAL] Fix hardcoded secret in ctube CLI — 1 file(s), 7 changed lines

Rule used: no bot note files, no lockfiles, no branch dumps over 15 files, nothing over 120 changed lines, and a file that conflicts rejects its whole pull request, so nothing landed half applied.

## The rest, and what to do with each
| PR | opened | bot | change | verdict | already in main |
|---|---|---|---|---|---|
| #460 | 2026-08-23 | Sentinel | Fix syntax errors and memory hazards in PersistenceLayer | already fixed on main, close it | 74% |
| #458 | 2026-08-22 | Bolt | Eliminate redundant payload Buffer allocation in Persisten | needs a rebase by hand | 50% |
| #457 | 2026-08-22 | Palette | Enhance copy button focus visibility and error feedback | needs a rebase by hand | 33% |
| #456 | 2026-08-22 | Sentinel | Fix uninitialized memory leak in PersistenceLayer | duplicate, close it |  |
| #455 | 2026-08-21 | Sentinel | Fix syntax error and uninitialized memory risk in Persiste | duplicate, close it |  |
| #454 | 2026-08-21 | Bolt | Optimize PersistenceLayer save string HMAC write | duplicate, close it |  |
| #452 | 2026-08-21 | Sentinel | Fix timing side-channel vulnerability in API key verificat | needs a rebase by hand | 17% |
| #451 | 2026-08-20 | Sentinel | Fix syntax error and replace Buffer.allocUnsafe with Buffe | duplicate, close it |  |
| #450 | 2026-08-20 | Palette | Add interactive clear button for User ID input | duplicate, close it |  |
| #449 | 2026-08-20 | Sentinel | Fix side-channel timing vulnerability in API key verificat | duplicate, close it |  |
| #448 | 2026-08-19 | Sentinel | Fix uninitialized memory leak in PersistenceLayer | duplicate, close it |  |
| #447 | 2026-08-19 | Palette | Add accessible clear button for User ID input | already fixed on main, close it | 77% |
| #446 | 2026-08-18 | Sentinel | [MEDIUM] Sanitize error logging across cache, gateway, and | needs a rebase by hand | 3% |
| #445 | 2026-08-18 | Bolt | eliminate redundant Buffer allocations in PersistenceLayer | duplicate, close it |  |
| #444 | 2026-08-18 | Palette | improve session creation button accessibility and status f | duplicate, close it |  |
| #443 | 2026-08-18 | Sentinel | Fix syntax errors and uninitialized memory leak hazard in  | duplicate, close it |  |
| #442 | 2026-08-17 | Sentinel | [MEDIUM] Fix syntax error and heap memory leak hazard in P | duplicate, close it |  |
| #441 | 2026-08-17 | Palette | Add interactive clear button for User ID input | already fixed on main, close it | 79% |
| #440 | 2026-08-17 | Sentinel | Fix syntax error and heap memory allocation in Persistence | duplicate, close it |  |
| #439 | 2026-08-16 | Sentinel | Fix uninitialized heap memory leak hazard in PersistenceLa | duplicate, close it |  |
| #438 | 2026-08-16 | Bolt | direct string HMAC update and single output allocation in  | duplicate, close it |  |
| #437 | 2026-08-16 | Palette | Synchronize aria-keyshortcuts on shortcut toggle | duplicate, close it |  |
| #436 | 2026-08-16 | Sentinel | Fix compilation errors and prevent uninitialized memory le | duplicate, close it |  |
| #435 | 2026-08-15 | Sentinel | Fix syntax errors and prevent memory leak hazard in Persis | needs a rebase by hand | 57% |
| #434 | 2026-08-15 | Bolt | optimize PersistenceLayer.save zero-copy serialization | duplicate, close it |  |
| #433 | 2026-08-15 | Palette | Add spinner animation to session creation button | duplicate, close it |  |
| #432 | 2026-08-15 | Sentinel | Fix PersistenceLayer uninitialized memory leak and syntax  | duplicate, close it |  |
| #431 | 2026-08-14 | Sentinel | [HIGH] Fix compilation error and uninitialized buffer haza | duplicate, close it |  |
| #430 | 2026-08-14 | Bolt | Optimize Persistence Layer serialization with zero-copy su | duplicate, close it |  |
| #429 | 2026-08-14 | Sentinel | Fix persistence layer security | duplicate, close it |  |
| #428 | 2026-08-13 | Sentinel | Fix Path Traversal in ShareService & Heap Memory leak in P | needs a rebase by hand | 20% |
| #427 | 2026-08-13 | Bolt | optimize target buffer allocation and payload handling in  | already fixed on main, close it | 74% |
| #426 | 2026-08-13 | Palette | Dynamic Keyboard Shortcuts & Skip-Link Accessibility | needs a rebase by hand | 28% |
| #425 | 2026-08-13 | Sentinel | Timing-Safe Comparison & PersistenceLayer Clean-up | needs a rebase by hand | 31% |
| #424 | 2026-08-12 | Sentinel | Fix compilation and redundant buffer allocation in Persist | needs a rebase by hand | 56% |
| #423 | 2026-08-12 | Bolt | Throttle Gateway Rolling Session Expiry with LRU Cache | needs a rebase by hand | 5% |
| #422 | 2026-08-11 | Sentinel | Fix compilation and syntax errors in PersistenceLayer | needs a rebase by hand | 50% |
| #421 | 2026-08-11 | Bolt | Zero-Copy Direct String HMAC Updates for Custom Persistenc | duplicate, close it |  |
| #420 | 2026-08-11 | Palette | Dynamic ARIA Keyshortcuts Toggling | needs a rebase by hand | 26% |
| #419 | 2026-08-11 | Sentinel | Fix path traversal in share service and typescript error i | needs a rebase by hand | 33% |
| #418 | 2026-08-10 | Sentinel | Fix path traversal in share service and typescript error i | duplicate, close it |  |
| #417 | 2026-08-10 | Bolt | Optimize PersistenceLayer save payload serialization and f | duplicate, close it |  |
| #416 | 2026-08-10 | Palette | enhance button focus visibility & shortcut ARIA sync | needs a rebase by hand | 37% |
| #415 | 2026-08-10 | Sentinel | Implement strict Path Traversal & file sharing containment | needs a rebase by hand | 13% |
| #414 | 2026-08-09 | Sentinel | [HIGH] Fix P2P Signaling DoS & Manifest Type Confusion | needs a rebase by hand | 54% |
| #413 | 2026-08-09 | Sentinel | Fix Session Rotation Replay Vulnerability | needs a rebase by hand | 56% |
| #412 | 2026-08-09 | Sentinel | Sanitize raw error logging in redisPool.ts to prevent cred | already fixed on main, close it | 75% |
| #411 | 2026-08-09 | Sentinel | [MEDIUM] Fix raw error object logging and credential leaka | needs a rebase by hand | 0% |
| #410 | 2026-08-09 | Sentinel | Harden governance and ledger consensus inputs | merged into the consolidation branch | 24% |
| #403 | 2026-08-08 | Palette | Implement Keyboard Shortcut Toggle for WCAG 2.1.4 Complian | duplicate, close it |  |
| #402 | 2026-08-08 | Sentinel | Fix type-confusion and DoS in selectiveUnpack | needs a rebase by hand | 18% |
| #401 | 2026-08-07 | Sentinel | [HIGH] Harden ClientManifestVerifier.ingestRevocationTicke | merged into the consolidation branch | 100% |
| #399 | 2026-08-07 | Sentinel | [HIGH] Harden VaultIndexer decryption against type-confusi | duplicate, close it |  |
| #396 | 2026-08-06 | Sentinel | Enforce strict input validation and payload bounds checks  | already fixed on main, close it | 61% |
| #394 | 2026-08-05 | Bolt | Optimize PersistenceLayer state serialization and validati | stale branch, nothing left to merge | 48% |
| #387 | 2026-08-02 | Bolt | Optimize PersistenceLayer Buffer Handling | needs a rebase by hand | 30% |
| #386 | 2026-08-02 | Palette | add cosmology map info placeholder | duplicate, close it |  |
| #385 | 2026-08-02 | Sentinel | [MEDIUM] Fix Type Confusion in Revocation Ticket Ingestion | duplicate, close it |  |
| #384 | 2026-08-02 | Sentinel | [security improvement] | duplicate, close it |  |
| #383 | 2026-08-01 | Sentinel | [security improvement] | needs a rebase by hand | 0% |
| #382 | 2026-08-01 | Bolt | Optimize verifier HMAC initialization | merged into the consolidation branch | 100% |
| #381 | 2026-08-01 | Palette | Restore placeholder on Cosmology Map interaction | duplicate, close it |  |
| #380 | 2026-07-31 | Bolt | Optimize PersistenceLayer Buffer operations | duplicate, close it |  |
| #379 | 2026-07-31 | Palette | Restore placeholder on Cosmology Map interaction | already fixed on main, close it | 94% |
| #378 | 2026-07-30 | Sentinel | [security improvement] | duplicate, close it |  |
| #377 | 2026-07-30 | Bolt | Optimize PersistenceLayer memory allocation and operations | duplicate, close it |  |
| #376 | 2026-07-30 | Palette | Add empty-state placeholder and auto-reset to Cosmology Ma | duplicate, close it |  |
| #375 | 2026-07-29 | Bolt | Optimize PersistenceLayer binary serialization | duplicate, close it |  |
| #374 | 2026-07-29 | Palette | Restore Cosmology Map Placeholder on Mouseleave/Blur | duplicate, close it |  |
| #373 | 2026-07-28 | Bolt | verifier proof execution path optimization | needs a rebase by hand | 14% |
| #372 | 2026-07-28 | Palette | Restore default placeholder for Cosmology Map archetype in | needs a rebase by hand | 38% |
| #371 | 2026-07-27 | Bolt | Optimize Sovereign OS Persistence Layer | duplicate, close it |  |
| #370 | 2026-07-27 | Palette | Add default placeholder & restore on leave/blur to cosmolo | duplicate, close it |  |
| #368 | 2026-07-26 | Bolt | Optimize PersistenceLayer save and verify throughput | needs a rebase by hand | 17% |
| #367 | 2026-07-26 | Palette | Restore Cosmology Map placeholder on mouseleave and blur | duplicate, close it |  |
| #366 | 2026-07-25 | Palette | cosmology map archetype info cleanup and placeholder resto | duplicate, close it |  |
| #362 | 2026-07-20 | Palette | Restore default placeholder for archetype-info on mouselea | already fixed on main, close it | 93% |
| #361 | 2026-07-20 | Sentinel | [security improvement] | duplicate, close it |  |
| #360 | 2026-07-19 | Bolt | Optimize FusionBuffer via amortized O(1) queue pruning | needs a rebase by hand | 39% |
| #359 | 2026-07-19 | Palette | Restore Default Placeholder on Mouseleave/Blur | needs a rebase by hand | 30% |
| #358 | 2026-07-18 | Sentinel | HIGH Fix Persistence Layer DoS | needs a rebase by hand | 53% |
| #357 | 2026-07-18 | Bolt | optimize PersistenceLayer serialization and verification | needs a rebase by hand | 33% |
| #356 | 2026-07-18 | Palette | Implement placeholder restoration and style deduplication  | duplicate, close it |  |
| #355 | 2026-07-17 | Bolt | Optimize FusionBuffer push with O(1) sliding window prunin | needs a rebase by hand | 50% |
| #354 | 2026-07-17 | Sentinel | [security improvement] | duplicate, close it |  |
| #353 | 2026-07-16 | Bolt | Optimize PersistenceLayer buffer operations | duplicate, close it |  |
| #352 | 2026-07-16 | Palette | [UX improvement] Enhance Archetype Info discoverability | duplicate, close it |  |
| #351 | 2026-07-16 | Sentinel | [HIGH] Fix DoS in PersistenceLayer via timingSafeEqual len | duplicate, close it |  |
| #350 | 2026-07-15 | Sentinel | [HIGH] Fix DoS in PersistenceLayer via timingSafeEqual mis | stale branch, nothing left to merge | 49% |
| #349 | 2026-07-15 | Bolt | [performance improvement] persistence layer buffer constru | duplicate, close it |  |
| #348 | 2026-07-15 | Palette | Improve Archetype Info discoverability and persistence | needs a rebase by hand | 12% |
| #347 | 2026-07-15 | Sentinel | [CRITICAL] Fix hardcoded secret in ctube CLI | merged into the consolidation branch | 71% |
| #346 | 2026-07-14 | Sentinel | [HIGH] Fix DoS vulnerability in PersistenceLayer | needs a rebase by hand | 14% |
| #345 | 2026-07-14 | Bolt | optimize PersistenceLayer with zero-copy Buffer operations | duplicate, close it |  |
| #344 | 2026-07-14 | Palette | Improve Archetype discovery and Tri-Shift styling | duplicate, close it |  |
| #343 | 2026-07-14 | Sentinel | [HIGH] Fix DoS vulnerability in PersistenceLayer | duplicate, close it |  |
| #342 | 2026-07-13 | Sentinel | [HIGH] Fix DoS vulnerability in PersistenceLayer | duplicate, close it |  |
| #341 | 2026-07-13 | Bolt | Consolidate static headers and pre-rendered UI fragments | needs a rebase by hand | 39% |
| #340 | 2026-07-13 | Palette | Improve Tri-Shift UI with semantic classes and hover effec | duplicate, close it |  |
| #339 | 2026-07-13 | Sentinel | [HIGH] Fix DoS vulnerability in PersistenceLayer | duplicate, close it |  |

## How to land any single one by hand
```bash
git fetch origin pull/<number>/head:pr/<number>
git checkout -b rebase/pr-<number> origin/main
git cherry-pick pr/<number>   # or git merge pr/<number>, resolve, test
```

## Notes for whoever reviews this
* Rerun the bot jobs on current main instead of rebasing sixty stale branches: the scanners and CodeQL already cover what Sentinel was hunting for.
* Close the ones marked "already fixed on main" first, that is most of the pile.
* The Jules folders (`.jules/`, `.Jules/`) hold the bots own logs. They are not code and were deliberately left out of this branch.
