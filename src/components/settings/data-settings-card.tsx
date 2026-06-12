import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Download, Upload } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save, open, confirm } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

/** Local backup/restore of the SQLite database via Rust file-copy commands. */
export function DataSettingsCard() {
  const [busy, setBusy] = useState(false);

  async function handleBackup() {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const dest = await save({
        defaultPath: `atelier-backup-${stamp}.db`,
        filters: [{ name: "SQLite database", extensions: ["db"] }],
      });
      if (!dest) return;
      setBusy(true);
      await invoke("db_backup", { dest });
      toast.success("Backup saved");
    } catch (err) {
      toast.error(`Backup failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SQLite database", extensions: ["db"] }],
      });
      if (!selected || typeof selected !== "string") return;
      const ok = await confirm(
        "Restoring will overwrite all current data and restart the app. Continue?",
        { title: "Restore backup", kind: "warning" },
      );
      if (!ok) return;
      setBusy(true);
      await invoke("db_restore", { src: selected });
      toast.success("Restored — restarting…");
      await relaunch();
    } catch (err) {
      toast.error(`Restore failed: ${String(err)}`);
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4" /> Data
        </CardTitle>
        <CardDescription>
          Back up your database to a file (e.g. a USB drive) and restore it
          later. Restoring replaces all current data.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleBackup} disabled={busy}>
          <Download /> Back up now
        </Button>
        <Button variant="outline" onClick={handleRestore} disabled={busy}>
          <Upload /> Restore…
        </Button>
      </CardContent>
    </Card>
  );
}
