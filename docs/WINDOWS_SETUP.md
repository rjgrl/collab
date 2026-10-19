# Windows setup

Use a supported Windows/CPU combination for MongoDB Community Server. Install Git, Node 26.10.0, pnpm 12.5.1 and MongoDB Server, then restart PowerShell. Standard MongoDB installation directories are discovered even if `mongod` is absent from PATH. Compass alone cannot run the database. The project uses a separate loopback rs0 process on 27018, alongside a standard Windows service on 27017 if installed.

Follow [development setup](DEVELOPMENT_SETUP.md). Run commands from the repository directory; no administrator shell, execution-policy change, hidden helper or global Prisma install is required by the project. The initial install needs network access and write permission in your workspace and package cache.

Before updating dependencies or generating Prisma, stop the development processes belonging to this checkout with Ctrl+C. Windows prevents replacing a loaded Prisma DLL and may report EPERM. Close terminals actually using this checkout, retry `pnpm setup:local`, and inspect antivirus/file permissions if the lock persists. Do not kill every node process, delete engines or copy another machine's generated client. The platform client is generated locally from the committed schema.

Do not store the project in a directory your security policy makes read-only. Keep `.env`, `.tools`, uploads and MongoDB files private. POSIX file modes requested by scripts do not establish Windows ACL isolation; use your Windows account/profile ACLs and confirm access if sharing a device. Database persistence is in `.tools/mongodb-rs0/data` for the process that originally started MongoDB; another checkout may reuse that process with a separate database. Keep that owner's directory intact.

The scripts use native Node process launching and hidden background MongoDB windows. Paths with spaces are supported without shell concatenation. Ports 3000/3001 must be free before starting the default app. Doctor labels occupied ports as information because it is also useful while your application is running.
