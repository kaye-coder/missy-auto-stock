"""Create an unsigned flat macOS Installer package without private client data.

Run with Python 3 on Linux with xar, mkbom and cpio available on PATH.
No application build is performed here; first launch prepares it on the Mac.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ENTRIES = ("src", "server", "scripts", "public", "package.json", "bun.lock",
                  "tsconfig.json", "vite.offline.config.ts", "Start Missy.command", "INSTALL_MAC.md")
EXCLUDED = {".git", ".jj", "node_modules", "data", "uploads", ".env", "dist", "dist-offline", ".asset.json"}

def source_files(root=ROOT):
    for entry in SOURCE_ENTRIES:
        path = root / entry
        candidates = sorted(path.rglob("*")) if path.is_dir() else [path]
        for file in candidates:
            relative = file.relative_to(root)
            if (file.is_file() and not file.is_symlink()
                    and not any(part in EXCLUDED for part in relative.parts)
                    and not file.name.endswith((".asset.json", ".log", ".db", ".db-wal", ".db-shm"))):
                yield file, relative

def package(output):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="missy-pkg-") as tmp:
        stage = Path(tmp)
        payload = stage / "payload"
        app = payload / "Missy.app" / "Contents"
        resources = app / "Resources"
        macos = app / "MacOS"
        resources.mkdir(parents=True)
        macos.mkdir()
        manifest = []
        with tarfile.open(resources / "application.tar.gz", "w:gz") as archive:
            for file, relative in source_files():
                archive.add(file, arcname=str(relative), recursive=False)
                manifest.append({"path": str(relative), "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
        (resources / "manifest.json").write_text(json.dumps(manifest, indent=2))
        shutil.copy2(ROOT / "scripts/mac-install.command", resources / "install-mac.command")
        (resources / "install-mac.command").chmod(0o755)
        launcher = macos / "Missy"
        launcher.write_text('''#!/bin/bash
set -e
RESOURCES="$(cd "$(dirname "$0")/../Resources" && pwd)"
COMMAND="$RESOURCES/install-mac.command"
CONFIG="$HOME/Library/Application Support/Missy Launcher"
if [ -L "$CONFIG/installed-root" ]; then
  ROOT="$(readlink "$CONFIG/installed-root")"
  [ ! -f "$ROOT/Start Missy.command" ] || COMMAND="$ROOT/Start Missy.command"
fi
osascript - "$COMMAND" <<'APPLESCRIPT'
on run argv
  tell application "Terminal"
    activate
    do script "bash " & quoted form of (item 1 of argv)
  end tell
end run
APPLESCRIPT
''')
        launcher.chmod(0o755)
        import plistlib
        (app / "Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": "com.ordersupreme.missy.installer",
            "CFBundleName": "Missy", "CFBundleDisplayName": "Missy",
            "CFBundleExecutable": "Missy", "CFBundlePackageType": "APPL",
            "CFBundleShortVersionString": "1.0.0", "CFBundleVersion": "1",
            "LSMinimumSystemVersion": "12.0", "CFBundleIconFile": "Missy.icns",
        }))
        from PIL import Image
        import io, struct
        image = Image.open(ROOT / "public/missy-logo.png").convert("RGBA")
        chunks = []
        for kind, size in ((b"ic07", 128), (b"ic08", 256), (b"ic09", 512)):
            canvas = Image.new("RGBA", (size, size))
            resized = image.copy()
            resized.thumbnail((size, size))
            canvas.alpha_composite(resized, ((size-resized.width)//2, (size-resized.height)//2))
            png = io.BytesIO()
            canvas.save(png, format="PNG")
            chunks.append(kind + struct.pack(">I", 8+len(png.getvalue())) + png.getvalue())
        body = b"".join(chunks)
        (resources / "Missy.icns").write_bytes(b"icns" + struct.pack(">I", len(body)+8) + body)
        component = stage / "component"
        component.mkdir()
        subprocess.run(["mkbom", str(payload), str(component / "Bom")], check=True)
        paths = subprocess.run(["find", ".", "-print0"], cwd=payload, check=True, capture_output=True).stdout
        cpio = subprocess.run(["cpio", "--null", "-o", "--format=odc"], cwd=payload, input=paths, capture_output=True, check=True)
        (component / "Payload").write_bytes(gzip.compress(cpio.stdout))
        files = list(payload.rglob("*"))
        info = ET.Element("pkg-info", {"format-version": "2", "identifier": "com.ordersupreme.missy.installer",
            "version": "1.0.0", "install-location": "/Applications", "auth": "root", "relocatable": "false"})
        ET.SubElement(info, "payload", {"numberOfFiles": str(len(files)), "installKBytes": str((sum(f.stat().st_size for f in files if f.is_file())+1023)//1024)})
        bundle = ET.SubElement(info, "bundle-version")
        ET.SubElement(bundle, "bundle", {"id": "com.ordersupreme.missy.installer", "CFBundleIdentifier": "com.ordersupreme.missy.installer", "path": "Missy.app", "CFBundleVersion": "1"})
        ET.ElementTree(info).write(component / "PackageInfo", encoding="utf-8", xml_declaration=True)
        subprocess.run(["xar", "-cf", str(output), "--compression", "none", "Bom", "Payload", "PackageInfo"], cwd=component, check=True)
        print(f"Created {output} ({output.stat().st_size:,} bytes); {len(manifest)} source files, no client data.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", help="Package output path, preferably under /tmp for inspection")
    package(parser.parse_args().output)