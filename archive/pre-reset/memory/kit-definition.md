---
name: kit-definition
description: "User's definition of an Easel \"kit\" — a toolbox of related building blocks, not a unified subsystem"
metadata:
  node_type: memory
  type: project
  originSessionId: b7c968e1-a054-4678-953c-17e50729e651
  modified: 2026-10-26T22:40:07.601Z
---

In Easel, a kit is a group of similar interfaces/components that an application pulls from — a list of building blocks. A kit is NOT unified code that does something, and is not itself a building block. The application composes blocks; kits don't orchestrate each other.

**Why:** User corrected the EASEL_KIT_CATALOG.md design (2026-10-26), which had layered kits calling each other's interfaces (Cards → Collections → Objects) and "composed mechanics" kits.

**How to apply:** When designing or reviewing kits, put cross-block composition in the application, not inside kits. Flag designs where a kit orchestrates other kits or is a complete engine (the existing easel.board kit, where chess is one `start("chess")` call, doesn't match this model).
