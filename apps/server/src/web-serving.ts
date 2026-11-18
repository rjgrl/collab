import express, { type RequestHandler } from "express";
import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const reserved = new Set(["api", "health", "rpc", "api-reference", "uploads", "backups", "node_modules"]);

function canonicalPath(value: string): string {
  let current = path.resolve(value);
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(value);
    suffix.unshift(path.basename(current));
    current = parent;
  }
  return path.join(realpathSync(current), ...suffix);
}

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function validateWebStorage(webRoot: string, uploads: string, backups?: string) {
  const web = canonicalPath(webRoot);
  const upload = canonicalPath(uploads);
  if (within(web, upload) || within(upload, web))
    throw new Error("UPLOAD_DIR must be separate from the public web build.");
  if (backups) {
    const backup = canonicalPath(backups);
    if (within(web, backup) || within(backup, web) || within(upload, backup))
      throw new Error("BACKUP_DIR must be outside UPLOAD_DIR and the public web build.");
  }
}

function rejectSymlinks(root: string) {
  for (const item of readdirSync(root, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error();
    if (item.isDirectory()) rejectSymlinks(path.join(root, item.name));
  }
}

export function webHandler(webRoot: string): RequestHandler {
  let root: string;
  try {
    if (
      !path.isAbsolute(webRoot) ||
      lstatSync(webRoot).isSymbolicLink() ||
      !statSync(path.join(webRoot, "index.html")).isFile()
    )
      throw new Error();
    root = realpathSync(webRoot);
    rejectSymlinks(root);
  } catch {
    throw new Error("Built frontend is unavailable. Run pnpm build before enabling SERVE_WEB.");
  }
  const router = express.Router();
  router.use(express.static(root, { dotfiles: "ignore", redirect: false }));
  router.use((request, response, next) => {
    if (path.posix.extname(request.path) || !request.accepts("html")) return next();
    response.sendFile("index.html", { root }, (error) => {
      if (error) next(error);
    });
  });
  return (request, response, next) => {
    if (!["GET", "HEAD"].includes(request.method)) return next();
    let pathname: string;
    try {
      pathname = decodeURIComponent(request.path);
    } catch {
      return next();
    }
    const segments = pathname.split("/").filter(Boolean);
    if (
      reserved.has(segments[0]?.toLowerCase() ?? "") ||
      segments.some((segment) => segment.startsWith(".") || segment.includes("\\"))
    )
      return next();
    router(request, response, next);
  };
}
