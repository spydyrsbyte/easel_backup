---
name: postgres-pipe-hang
description: "Never pipe output of scripts that start PostgreSQL (test-security.ps1, database.ps1 start) — the postmaster inherits the pipe and the command hangs"
metadata:
  node_type: memory
  type: feedback
  originSessionId: b7c968e1-a054-4678-953c-17e50729e651
  modified: 2026-10-28T00:25:27.816Z
---

Run `scripts/test-security.ps1` and `scripts/database.ps1 start` directly in the foreground, with no `|`, `| Out-Null`, `| Select-String`, or `*>&1 | Out-File`. PostgreSQL inherits the pipe handle, so the pipeline never closes and the command hangs.

**Why:** This hung background runs three times in one session (2026-10-27), orphaned temporary clusters under `Easel/bin/security-postgres-*`, and once left the user's local PostgreSQL started from a dead console so new backends crashed with 0xC0000142.

**How to apply:** Use `& .\scripts\test-security.ps1 -Run '<pattern>'; "exit=$LASTEXITCODE"` with timeout up to 600000ms. If a run hangs, stop it, then `pg_ctl stop` and remove leftover `bin/security-postgres-*` dirs. For the user's own database, check whether PostgreSQL was already running and leave it in the state found. See also [[kit-definition]].
