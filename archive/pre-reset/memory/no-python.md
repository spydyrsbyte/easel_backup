---
name: no-python
description: "Python is not installed on the user's machine; never write or run Python scripts"
metadata:
  node_type: memory
  type: feedback
  originSessionId: d741c209-3a8b-42f4-9708-f4b0ac8da984
  modified: 2026-11-12T01:31:21.567Z
---

Python is not installed on this machine. Do not run `python`/`py` or write helper scripts in Python.

**Why:** The user noticed tools reaching for Python constantly ("every third prompt") and it always fails.

**How to apply:** Use PowerShell, Go (`go run`), or Node for any scripting, text processing, or one-off automation in the Easel project.
