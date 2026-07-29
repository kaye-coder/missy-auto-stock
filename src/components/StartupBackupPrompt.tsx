import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { backups, type BackupFile } from "@/lib/local-client";
import { getAuthToken } from "@/lib/auth";
import { dateTime } from "@/lib/format";

const ONCE_KEY = "missy.startup-backup-prompt.v1";

/**
 * On every app start: silently take a safety backup, then ask the user whether
 * they want a fresh backup or to restore an earlier one.
 */
export function StartupBackupPrompt() {
  const [open, setOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(ONCE_KEY)) return;
    sessionStorage.setItem(ONCE_KEY, "1");
    const token = getAuthToken();
    // Automatic background backup on startup.
    if (token) backups.create(token).catch(() => undefined);
    setOpen(true);
  }, []);

  const doBackup = async () => {
    const token = getAuthToken();
    if (!token) return;
    setBusy(true);
    try {
      const file = await backups.create(token);
      toast.success(`Backup saved — ${file.name}`);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openRestore = async () => {
    try {
      setFiles(await backups.list());
    } catch {
      setFiles([]);
    }
    setOpen(false);
    setRestoreOpen(true);
  };

  const dismiss = () => {
    setOpen(false);
    toast.warning("In case of a system crash, you will lose all unbacked data.", {
      duration: 8000,
    });
  };

  const confirmRestore = async () => {
    const token = getAuthToken();
    if (!token || !pick) return;
    setBusy(true);
    try {
      await backups.restore(token, pick);
      toast.success("Backup restored");
      setRestoreOpen(false);
      setPick(null);
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AlertDialog open={open} onOpenChange={(o) => !o && dismiss()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Do you want to Backup or Restore data?</AlertDialogTitle>
            <AlertDialogDescription>
              An automatic backup has been taken. You can save a fresh backup now or restore an
              earlier one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={dismiss}>No</AlertDialogCancel>
            <Button variant="outline" onClick={openRestore} disabled={busy}>
              Restore
            </Button>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void doBackup(); }} disabled={busy}>
              Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={restoreOpen} onOpenChange={(o) => { if (!o) { setRestoreOpen(false); setPick(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Restore a backup</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-auto">
            {files.length === 0 && (
              <p className="text-sm text-muted-foreground">No backups available yet.</p>
            )}
            {files.map((f) => (
              <button
                key={f.name}
                onClick={() => setPick(f.name)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                  pick === f.name ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <span className="font-medium">{f.name}</span>
                <span className="text-xs text-muted-foreground">{dateTime(f.createdAt)}</span>
              </button>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setRestoreOpen(false); setPick(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!pick || busy}
              onClick={confirmRestore}
            >
              Confirm restore (overwrites current data)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
