---
name: game-roles-not-hard-permissions
description: "In Easel games, ownership/viewer/controller roles are game settings checked in server code, not record-level security policies"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 61396447-4df2-4121-be72-7613b3d83536
  modified: 2026-10-30T05:10:46.346Z
---

Per-record roles in an Easel game (owner, viewer, controller of an actor, etc.) are game settings. The server reads every record and decides in game code what each user may do and what they are sent. Record-level security policies only separate broad roles (GM / player / spectator). Every role is a list: any number of owners, viewers, controllers.

Owners can do everything a controller can (an owner can always move their own token). A controller is an extra grant, e.g. a character controlling an NPC; it never limits owners.

**Why:** User corrected a design (2026-10-30) that put owner/viewer/controller into hard read/modify policies with one user per role: "The server is not the end user… these are game settings NOT hard permissions."

**How to apply:** Don't restrict record reads per user with security policies; filter in the per-viewer projection instead. Model per-record roles as user-ID lists checked in server code (see easel.vtt `server/interaction.mjs`). Related: [[application-not-thin]].
