# Windows setup

Use a supported Windows/CPU combination for MongoDB Community Server. Install Git, Node 26.10.0, pnpm 12.5.1 and MongoDB Server, then restart PowerShell. Standard MongoDB installation directories are discovered even if `mongod` is absent from PATH. Compass alone cannot run the database. The project uses a separate loopback rs0 process on 27018, alongside a standard Windows service on 27017 if installed.

Follow [development setup](DEVELOPMENT_SETUP.md). Run commands from the repository directory; no administrator shell, execution-policy change, hidden helper or global database CLI install is required by the project. The initial install needs network access and write permission in your workspace and package cache.

Before updating dependencies, stop development processes belonging to this checkout with Ctrl+C. If installation reports EPERM, inspect antivirus/file permissions and close terminals actually using this checkout. Do not kill every Node process or copy another machine's dependencies. Mongoose needs no generated client or database engine DLL.

Do not store the project in a directory your security policy makes read-only. Keep `.env`, `.tools`, uploads and MongoDB files private. POSIX file modes requested by scripts do not establish Windows ACL isolation; use your Windows account/profile ACLs and confirm access if sharing a device. Database persistence is in `.tools/mongodb-rs0/data` for the process that originally started MongoDB; another checkout may reuse that process with a separate database. Keep that owner's directory intact.

The scripts use native Node process launching and hidden background MongoDB windows. Paths with spaces are supported without shell concatenation. Ports 3000/3001 must be free before starting the default app. Doctor labels occupied ports as information because it is also useful while your application is running.

Current architecture and database cutover instructions: [migration runbook](migrations/MONGOOSE_REST.md). Existing names, ObjectIds and records are preserved; migration is dry-run by default.
