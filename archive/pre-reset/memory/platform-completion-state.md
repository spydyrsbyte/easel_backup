---
name: platform-completion-state
description: "State of the Easel platform after the 2026-11-11 completion pass — what was built, how to verify it, and what is still open"
metadata:
  node_type: memory
  type: project
  originSessionId: d741c209-3a8b-42f4-9708-f4b0ac8da984
  modified: 2026-11-12T02:40:13.861Z
---

On 2026-11-11 the Easel platform items in `EASEL-COMPLETION-REVIEW.md` (workspace root) were built in `Easel/`, which is now a git repository with one commit per block on top of a baseline commit. That file is now a status report, not a to-do list.

Built: server-application records/security/automations/files, game file storage, browser sign-in challenges, operator commands (`easel backup|restore|export|import|schema|files|packages|license|publisher|games|accounts|version`), package install/update/rollback, suspend/resume with kept timers, multiple logical servers (`config/servers.json`), running-game ownership via PostgreSQL advisory locks, three editions by build tag, protected (sealed, licensed) packages. Operator guide: `Easel/design/operations.md`.

Verify with `scripts/test-security.ps1` (add `EASEL_PLAYWRIGHT_MODULE` for browser tests), `scripts/smoke.ps1` (real executables), and `-Bench . -Package ./internal/games`.

Still open: no admin screens for the new features, no upload kit component, server-application timers not persisted, scripts are Windows-only, kit libraries and game applications were not audited against [[kit-definition]].

**Why:** The user has limited access to the strongest model and wanted the platform finished in one pass; later sessions need to know it is done and where the evidence is rather than re-deriving it.

**How to apply:** Database schema is version 2 (`hosting.installation`); a database from an older build must be recreated, never migrated (see `Easel/AGENTS.md`). Schema changes go in the canonical `schema.sql` and bump `database.SchemaVersion`. See [[easel-concept]] for the per-server isolation decisions.
