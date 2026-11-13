import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const installer = resolve("scripts/mac-install.command");

function fixture(choice) {
  const base = mkdtempSync(join(tmpdir(), "missy-installer-"));
  const home = join(base, "home");
  const root = join(home, "Documents", "Missy");
  const resources = join(base, "Missy.app", "Contents", "Resources");
  const source = join(base, "source");
  const bin = join(base, "bin");
  for (const path of [home, resources, source, bin, join(home, "Desktop")]) mkdirSync(path, { recursive: true });
  writeFileSync(join(source, "Start Missy.command"), '#!/bin/bash\nprintf ready > "$HOME/launched"\n', { mode: 0o755 });
  writeFileSync(join(source, "package.json"), "{}");
  mkdirSync(join(source, "server"));
  writeFileSync(join(source, "server", "index.mjs"), "// new app");
  assert.equal(spawnSync("tar", ["-czf", join(resources, "application.tar.gz"), "-C", source, "."]).status, 0);
  writeFileSync(join(bin, "osascript"), `#!/bin/bash\ncase "$*" in *'choose folder'*) printf '%s' "$TEST_ROOT";; *) printf '%s' "$TEST_CHOICE";; esac\n`, { mode: 0o755 });
  // Simulate the Mac's rsync with copying; fixture contains only allowed app files.
  writeFileSync(join(bin, "rsync"), '#!/bin/bash\nargs=("$@")\nn=${#args[@]}\ncp -a "${args[$((n-2))]}." "${args[$((n-1))]}"\n', { mode: 0o755 });
  const command = join(resources, "install-mac.command");
  writeFileSync(command, readFileSync(installer), { mode: 0o755 });
  const run = () => spawnSync("bash", [command], { encoding: "utf8", env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, TEST_ROOT: root, TEST_CHOICE: choice } });
  return { base, home, root, run };
}

test("existing-shop update preserves database, photos and backup settings", () => {
  const f = fixture("Update existing");
  try {
    for (const dir of ["data", "uploads", "server", "dist-offline"]) mkdirSync(join(f.root, dir), { recursive: true });
    for (const [file, value] of [["data/missy.db", "client sales"], ["uploads/photo.jpg", "client photo"], ["data/launcher.json", '{"backupDirectory":"/chosen"}'], ["package.json", "{}"], ["server/index.mjs", "// old"]]) writeFileSync(join(f.root, file), value);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(readFileSync(join(f.root, "data/missy.db"), "utf8"), "client sales");
    assert.equal(readFileSync(join(f.root, "uploads/photo.jpg"), "utf8"), "client photo");
    assert.equal(readFileSync(join(f.root, "data/launcher.json"), "utf8"), '{"backupDirectory":"/chosen"}');
    assert.equal(existsSync(join(f.root, "dist-offline")), false);
    assert.equal(readlinkSync(join(f.home, "Library/Application Support/Missy Launcher/installed-root")), f.root);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("new installation refuses an existing shop folder", () => {
  const f = fixture("New installation");
  try {
    mkdirSync(f.root, { recursive: true });
    writeFileSync(join(f.root, "precious"), "keep");
    assert.notEqual(f.run().status, 0);
    assert.equal(readFileSync(join(f.root, "precious"), "utf8"), "keep");
    assert.equal(existsSync(join(f.home, "launched")), false);
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test("a new shop installs into Documents and creates a Desktop app shortcut", () => {
  const f = fixture("New installation");
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(readFileSync(join(f.home, "launched"), "utf8"), "ready");
    assert.ok(readlinkSync(join(f.home, "Desktop/Missy.app")).endsWith("Missy.app"));
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});