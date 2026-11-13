# Install Missy on the Mac (one click)

## Single-file installer: Missy-Mac-Installer.pkg

1. Send only **Missy-Mac-Installer.pkg**. Open it on the Mac and follow Apple's Installer prompts (the Mac administrator password may be required).
2. Open **Missy** in Applications. This package is unsigned: macOS may require **System Settings → Privacy & Security → Open Anyway** after a blocked attempt. Do not disable Mac security globally.
3. Choose **Update existing** for a shop already using Missy, then select its original app folder. Back up first and stop its running server. Never choose a new installation for existing shop records.
4. For a new shop, choose **New installation**; app files are placed in Documents/Missy.
5. Keep internet connected for first setup. Missy checks Node.js, downloads a verified portable runtime if needed, installs app requirements, prepares offline files, and asks for a backup folder. Setup time depends on the Mac and connection.
6. After successful setup, a **Missy** app shortcut appears on the Desktop; use it for subsequent offline launches. Keep the original app folder in place. The application opens in the Mac's browser and remains available to other computers on the local network.

The installer contains no client records, passwords or product uploads. An update copies application files only into the folder you select; the existing data and uploads folders are preserved. Backup settings are retained. If setup fails, reopen Missy in Applications to retry. A conflicting port 8080 must be freed first; the installer does not stop another application automatically.

**Verification limitation:** package structure, extraction and preservation are checked here; Apple's installation prompts, Mac permissions, first preparation and printer operation need confirmation on a real Mac. This is not a signed/notarized App Store application.

## Earlier ZIP installer

1. Unzip **Missy-Offline-Installer.zip** and move the **Missy** folder to Documents (keep it there permanently).
2. Open the folder, **right-click "Start Missy.command" → Open → Open** (only the first time; macOS asks once).
3. Wait. The first launch (needs internet, ~3–5 min) automatically:
   - downloads Node.js if missing (no admin password needed),
   - installs app components,
   - prepares the fast offline app,
   - asks you to choose a backup folder,
   - places a **Missy** shortcut on the Desktop.
4. From then on: double-click **Missy** on the Desktop — it opens instantly, fully offline.

If anything goes wrong: connect to the internet and open "Start Missy.command" again; it resumes where it stopped. Existing data in the `data` and `uploads` folders is never touched.
