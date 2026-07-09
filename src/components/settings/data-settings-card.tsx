import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Download, Upload } from "lucide-react";
import { invoke } from "@tauri-apps/api/tauri";
import { save, open, confirm } from "@tauri-apps/api/dialog";
import { relaunch } from "@tauri-apps/api/process";
import { toast } from "sonner";

/** Local backup/restore of the SQLite database via Rust file-copy commands. */
export function DataSettingsCard() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  async function handleBackup() {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const dest = await save({
        defaultPath: `atelier-backup-${stamp}.db`,
        filters: [{ name: t("settings.data.sqliteDatabase"), extensions: ["db"] }],
      });
      if (!dest) return;
      setBusy(true);
      await invoke("db_backup", { dest });
      toast.success(t("settings.data.backupSaved"));
    } catch (err) {
      toast.error(t("settings.data.backupFailed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: t("settings.data.sqliteDatabase"), extensions: ["db"] }],
      });
      if (!selected || typeof selected !== "string") return;
      const ok = await confirm(t("settings.data.restoreConfirm"), {
        title: t("settings.data.restoreTitle"),
        type: "warning",
      });
      if (!ok) return;
      setBusy(true);
      await invoke("db_restore", { src: selected });
      toast.success(t("settings.data.restored"));
      await relaunch();
    } catch (err) {
      toast.error(t("settings.data.restoreFailed", { error: String(err) }));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4" /> {t("settings.data.title")}
        </CardTitle>
        <CardDescription>{t("settings.data.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handleBackup} disabled={busy}>
          <Download /> {t("settings.data.backupNow")}
        </Button>
        <Button variant="outline" onClick={handleRestore} disabled={busy}>
          <Upload /> {t("settings.data.restore")}
        </Button>
      </CardContent>
    </Card>
  );
}
