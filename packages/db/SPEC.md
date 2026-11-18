---
id: database-runtime
type: module-design
status: draft
title: Database Runtime and Environment Selection
tags: [database, persistence]
---

## Responsibility

Own the Mongoose connection, model creation and transaction scope used by the API and operator tooling. The configured MongoDB is the durable record authority. There is no in-memory, JSON-file, browser-storage or second-database fallback for application records.

## Environment Contract

`MONGO_URI` is the preferred hosted setting. `DATABASE_URL` remains supported so existing local, migration and backup tooling does not silently select another database or break on deployment. Values are trimmed; at least one nonempty MongoDB URI is required. Two nonempty values must be identical, including options. Ambiguity and malformed schemes fail before model use rather than preferring one target.

The package remains database-name agnostic: isolated local namespaces and explicit operator connections use the same library. Production database-name, TLS and hosting restrictions belong to `server-runtime`. Neither the resolver nor the connection factory invents a default URL or rewrites a supplied database name.

## Boundary

Connection construction disables automatic collection/index creation. Startup does not seed, migrate, reset, merge or synchronize databases. Explicit migration/initialization tools retain their own preconditions and authorization requirements.

API services own record validation, scope and authorization; changing the connection does not grant new permissions. Test-only model doubles live outside production execution paths. Driver failure must remain a failed operation, not a successful local save.

Constructor configuration errors and operator-facing failure messages omit credentials and record contents. The server owns bounded health probes and sanitized startup reporting. Private URI values are never browser build variables or command-line arguments.
