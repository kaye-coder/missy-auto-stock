import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export function backupDirectory(dataDir, override) {
  if (override) {
    if (!isAbsolute(override)) throw new Error("Backup folder must be an absolute path");
    return resolve(override);
  }
  const file = resolve(dataDir, "launcher.json");
  if (existsSync(file)) {
    const config = JSON.parse(readFileSync(file, "utf8"));
    if (typeof config.backupDirectory === "string" && isAbsolute(config.backupDirectory)) {
      return resolve(config.backupDirectory);
    }
    throw new Error("The saved backup folder is invalid; check data/launcher.json");
  }
  return resolve(dataDir, "backups");
}