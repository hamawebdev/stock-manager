import { useTranslation } from "react-i18next";
import { Paperclip, FileText, ImageIcon, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExpenseAttachment } from "@/lib/pos/expenses";
import type { PickedFile } from "@/lib/expense-attachments";
import { openAttachment } from "@/lib/expense-attachments";

function humanSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string | null | undefined, name: string): boolean {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|heic|bmp)$/i.test(name);
}

interface Props {
  /** Already-persisted attachments (edit mode). */
  saved: ExpenseAttachment[];
  /** Files picked but not yet written to disk (new/unsaved rows). */
  pending: PickedFile[];
  onPick: () => void;
  onRemoveSaved: (a: ExpenseAttachment) => void;
  onRemovePending: (index: number) => void;
  disabled?: boolean;
}

/** Receipt / invoice attachment manager used inside the expense form. */
export function AttachmentsField({
  saved,
  pending,
  onPick,
  onRemoveSaved,
  onRemovePending,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const isEmpty = saved.length === 0 && pending.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t("expenses.attachments")}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onPick}
          disabled={disabled}
        >
          <Paperclip className="size-4" />
          {t("expenses.attach")}
        </Button>
      </div>

      {isEmpty ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-4 text-center text-xs">
          {t("expenses.noAttachments")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {saved.map((a) => {
            const Icon = isImage(a.mime, a.file_name) ? ImageIcon : FileText;
            return (
              <li
                key={`saved-${a.id}`}
                className="bg-muted/40 flex items-center gap-2 rounded-lg border px-2 py-1.5"
              >
                <Icon className="text-muted-foreground size-4 shrink-0" />
                <span className="flex-1 truncate text-sm">{a.file_name}</span>
                <span className="text-muted-foreground text-xs">
                  {humanSize(a.size_bytes)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => void openAttachment(a.path)}
                  title={t("common.open")}
                >
                  <ExternalLink className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-destructive size-7"
                  onClick={() => onRemoveSaved(a)}
                  title={t("common.delete")}
                >
                  <X className="size-4" />
                </Button>
              </li>
            );
          })}

          {pending.map((f, i) => {
            const Icon = isImage(f.mime, f.name) ? ImageIcon : FileText;
            return (
              <li
                key={`pending-${i}`}
                className="border-primary/40 bg-primary/5 flex items-center gap-2 rounded-lg border border-dashed px-2 py-1.5"
              >
                <Icon className="text-muted-foreground size-4 shrink-0" />
                <span className="flex-1 truncate text-sm">{f.name}</span>
                <span className="text-muted-foreground text-xs">
                  {humanSize(f.bytes.byteLength)}
                </span>
                <span className="text-primary text-[10px] font-medium uppercase">
                  {t("expenses.pending")}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-destructive size-7"
                  onClick={() => onRemovePending(i)}
                  title={t("common.remove")}
                >
                  <X className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
