# Easel — Licensing Specification

**Version:** 1.2  
**Status:** Approved — Additional details may be defined as development progresses.

## 1. Overview

Easel uses a trust-based licensing model consisting of four license types distributed through three compiled editions.

Licensing distinguishes between an installation, a logical Easel server, and an individual game session. License limits apply to logical servers and active games, not operating-system processes or software installations.

The licensing model is designed to:

- Support individual Game Masters, gaming groups, nonprofit clubs, and commercial hosting providers.
- Grant permanent software usage rights without recurring fees, except for ongoing Reseller privileges.
- Minimize licensing infrastructure and enforcement overhead.
- Allow customers to install and migrate Easel between machines.
- Keep licensing independent of game packages and their execution logic.
- Rely primarily on customers honoring contractual licensing restrictions.

## 2. Deployment and Runtime Terminology

### 2.1 Installation

An **Installation** is a deployed and running instance of the Easel Go application.

- An installation operates within a Go process.
- A single installation may host multiple logical Easel servers.
- The installation manages shared infrastructure, including database connections, network communication, and runtime scheduling.
- Multiple installations may connect to the same PostgreSQL database.
- License server-count limits are not based on the number of installations or Go processes.

### 2.2 Server

A **Server** is a logical runtime collection of game sessions managed by an Easel installation.

- A server contains zero or more game sessions.
- Multiple servers may operate within one Go process.
- Servers can be independently managed.
- Each server has its own logical identity.
- A server does not require a dedicated operating-system process.
- An installation may host multiple servers concurrently, subject to applicable licensing terms.

The term *server* throughout this specification refers to a logical Easel server, not a physical machine, virtual machine, container, or Go process.

### 2.3 Game Session

A **Game Session** is an individual game execution environment belonging to a logical Easel server.

- Each active game session has its own Sobek JavaScript runtime.
- Each game session maintains independent game state.
- Game sessions execute independently of one another.
- Sessions may be suspended, restored, or migrated.
- An active session counts toward applicable concurrent-game limits even when no players are interacting with it.

### 2.4 Runtime Hierarchy

The conceptual hierarchy is:

```text
Easel Installation (Go Process)
│
├── Logical Server A
│   ├── Game Session 1 (Sobek Runtime)
│   └── Game Session 2 (Sobek Runtime)
│
├── Logical Server B
│   ├── Game Session 3 (Sobek Runtime)
│   └── Game Session 4 (Sobek Runtime)
│
└── Shared Infrastructure
    ├── Database Connections
    ├── Network Communication
    └── Runtime Scheduling
```

Multiple Easel installations may operate concurrently and access shared persistent infrastructure.

## 3. License Types

| License | Concurrent logical servers | Concurrent active games | Participating players | Ownership |
|---|---|---|---|---|
| GM | 1 | 1 | Unlimited | Permanent |
| Group | 1 | Unlimited | Unlimited | Permanent |
| Club | Unlimited | Purchased quantity | Unlimited | Permanent |
| Reseller | Unlimited | Unlimited | Unlimited | Permanent, with ongoing Reseller privileges |

### 3.1 GM License

The GM license is intended for an individual Game Master.

**Permissions**

- Licensed to one individual.
- Permits one simultaneously active logical Easel server.
- Permits one active game session.
- Allows unlimited participating players, subject to game-specific restrictions.
- Permits multiple installations, provided only one logical server is active at a time.
- Permits moving installations between machines.
- Grants permanent software usage rights.

**Technical Enforcement**

- The GM edition enforces a maximum of one active game session.
- An idle but running session occupies the available concurrency slot.
- The existing session must be suspended or stopped before another game may become active.
- The single-logical-server restriction is contractual and is not enforced across installations.

### 3.2 Group License

The Group license is intended for gaming groups and communities operating a shared logical server.

**Permissions**

- Permits one simultaneously active logical Easel server.
- Permits unlimited concurrent active games within that server.
- Permits unlimited users and participating players.
- Permits multiple installations, provided only one logical server is active at a time.
- Permits transferring installations between machines.
- Grants permanent software usage rights.

**Technical Enforcement**

- No technical restriction on concurrent game sessions.
- No technical restriction on participating users.
- The single-logical-server limit is contractual.

### 3.3 Club License

The Club license provides reduced-cost access to nonprofit gaming organizations.

**Eligibility**

- U.S.-based organizations must qualify as nonprofit organizations.
- Eligibility is a contractual purchasing requirement.

**Permissions**

- Permits unlimited simultaneously active logical servers.
- Permits logical servers to be distributed across multiple Easel installations.
- Permits unlimited participating users.
- Permits a purchased quantity of concurrent active games across all logical servers.
- Only active games count toward purchased concurrency.
- Additional concurrency may be purchased.
- Grants permanent software usage rights.

**Technical Enforcement**

- No technical restriction on the number of logical servers.
- No technical enforcement of purchased concurrent-game quantities.
- The organization is responsible for honoring its concurrency allowance.

The Club license uses the same executable as the Reseller license.

### 3.4 Reseller License

The Reseller license is intended for organizations operating commercial Easel hosting services.

**Permissions**

- Permits unlimited logical servers across unlimited installations.
- Permits unlimited concurrent active games.
- Permits unlimited participating users.
- Permits hosting game sessions and providing Easel services to third parties.

**Restrictions**

- Does not grant permission to redistribute Easel executables.
- Does not grant permission to sublicense Easel software.
- Third-party access is provided through hosted services.

**Ownership and Duration**

- The license holder permanently owns the purchased software usage rights.
- Commercial Reseller privileges require ongoing license maintenance.
- If Reseller privileges lapse, the license holder retains Group-level usage rights.
- Continuing commercial hosting under Reseller terms requires an active Reseller license.

**Technical Enforcement**

- No technical restriction on logical server count or concurrent games.
- Reseller privileges are governed contractually.

## 4. Compiled Editions

Easel will provide three compiled server editions from a common Go codebase.

| Edition | Supported license | Technical game limit |
|---|---|---|
| GM Edition | GM | One active game |
| Group Edition | Group | Unlimited |
| Unrestricted Edition | Club and Reseller | Unlimited |

### 4.1 Build Configuration

Go build constraints may be used to include edition-specific functionality at compilation.

- The GM edition contains local single-game enforcement.
- The Group edition permits unlimited game sessions.
- The Unrestricted edition permits unlimited game sessions and logical servers.
- Club and Reseller receive the same compiled executable.

### 4.2 Shared Functionality

All editions must maintain compatible:

- Game package formats.
- Sobek runtime interfaces.
- Component contracts.
- Kit interfaces.
- Client communication protocols.
- Persistence formats.
- Session suspension and restoration.
- Game session migration.
- User-facing gameplay functionality.

Game packages must not require separate implementations for different Easel editions.

## 5. Active Game Definition

An active game is a game session whose runtime is running.

Player activity does not affect active status.

| Session state | Counts toward game concurrency |
|---|---|
| Running and processing messages | Yes |
| Running but idle | Yes |
| Suspended | No |
| Stopped | No |

A session without connected players remains active if its runtime is running.

A game may be suspended to release its active-game slot while preserving persistent state.

### 5.1 GM Concurrency

The GM edition permits one active game session.

Attempting to activate another game while one is already running must be rejected unless the existing session is first suspended or stopped.

### 5.2 Club Concurrency

Club concurrency is calculated across all logical servers and installations belonging to the license holder.

For example, a Club license permitting 10 active games may run those games on one logical server or distribute them across multiple logical servers and installations, provided no more than 10 game sessions are active simultaneously.

This allowance is contractual and is not technically enforced.

## 6. Trust-Based Licensing

Easel must operate without requiring a centralized license validation service.

The software will not depend on:

- Online license verification.
- Periodic licensing-server communication.
- Hardware-bound activation.
- Centralized monitoring of logical servers.
- Distributed game concurrency tracking.
- Automatic enforcement of Club purchase quantities.

GM and Group logical-server limits are contractual.

Club concurrency limits are contractual.

The GM edition enforces its single-active-game limit locally.

## 7. Ownership, Updates, and Duration

### 7.1 Permanent Usage Rights

GM, Group, and Club licenses grant permanent usage rights under their respective operating terms.

These licenses do not require recurring payments to continue operating the purchased software.

### 7.2 Software Updates

All license types include access to future software updates and major versions.

### 7.3 Reseller Privileges

Reseller license holders retain permanent software usage rights.

Commercial hosting privileges under Reseller terms require ongoing license maintenance.

When those privileges lapse, the holder retains Group-level usage rights, including the limit of one simultaneously active logical server.

## 8. License Upgrades

License holders may obtain an edition providing additional operating rights.

Examples include:

- GM to Group.
- Group to Club, subject to eligibility.
- Group to Reseller.
- Club to Reseller.

Where an upgrade requires a different executable, the installation must support replacing that executable without losing persistent data.

The upgrade process must preserve compatible game packages, game state, user data, configuration, installed kits, components, and persistent assets.

Existing active sessions may be suspended and subsequently restored as part of an upgrade.

## 9. Architectural Requirements

**LIC-001 — Build Variants**  
Easel must provide three compiled editions from one codebase.

**LIC-002 — Logical Server Model**  
A logical Easel server is a collection of game sessions, not an operating-system process.

**LIC-003 — Multiple Servers per Installation**  
A single Go process must be capable of hosting multiple logical Easel servers.

**LIC-004 — Independent Session Runtimes**  
Each active game session must execute within its own Sobek runtime.

**LIC-005 — GM Game Limit**  
The GM edition must prevent more than one active game session locally.

**LIC-006 — Player Independence**  
Licensing must not impose a limit of one participating player under the GM edition.

**LIC-007 — Contractual Server Limits**  
GM and Group logical-server limits are contractual.

**LIC-008 — Club Honor System**  
Club concurrency limits must not require distributed tracking or enforcement.

**LIC-009 — Identical Club and Reseller Executables**  
Club and Reseller must use the same compiled edition.

**LIC-010 — Common Runtime Interfaces**  
Game packages and kits must remain compatible across editions.

**LIC-011 — Persistent Ownership**  
GM, Group, and Club software usage rights do not expire.

**LIC-012 — Reseller Fallback**  
Lapsed Reseller privileges preserve Group-level usage rights.

**LIC-013 — No External Licensing Dependency**  
Easel must remain operational without contacting a licensing service.

**LIC-014 — Shared Database Support**  
Multiple Easel installations must be capable of connecting to the same PostgreSQL database.

## 10. Approved Design Decisions

| ID | Decision |
|---|---|
| AD-L01 | Four license types: GM, Group, Club, Reseller |
| AD-L02 | Three compiled server editions |
| AD-L03 | Installation refers to a deployed Go process |
| AD-L04 | Server refers to a logical collection of game sessions |
| AD-L05 | One Go process may host multiple logical servers |
| AD-L06 | One active game session uses one Sobek runtime |
| AD-L07 | GM licenses belong to one individual |
| AD-L08 | GM permits unlimited participating players and one active game |
| AD-L09 | GM and Group each permit one active logical server |
| AD-L10 | Group permits unlimited concurrent games |
| AD-L11 | Club permits unlimited logical servers with purchased game concurrency |
| AD-L12 | U.S.-based Club licensees must qualify as nonprofits |
| AD-L13 | Club concurrency is not technically enforced |
| AD-L14 | Club and Reseller use the same executable |
| AD-L15 | Reseller permits commercial hosting but not redistribution or sublicensing |
| AD-L16 | GM, Group, and Club usage rights are permanent |
| AD-L17 | Reseller commercial privileges require ongoing maintenance |
| AD-L18 | Lapsed Reseller privileges revert to Group usage rights |
| AD-L19 | Active but idle game sessions count toward concurrency |
| AD-L20 | Suspended and stopped sessions do not count |
| AD-L21 | All license types include future updates and major versions |
| AD-L22 | Multiple installations may access a shared PostgreSQL database |