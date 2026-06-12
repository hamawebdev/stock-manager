import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface UploaderImage {
  /** Stable local key. For saved images use `saved-<dbId>`, for new ones a uuid. */
  key: string;
  src: string; // object URL (pending) or asset URL (saved)
  isPrimary: boolean;
  saved: boolean;
}

interface Props {
  images: UploaderImage[];
  onAddFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  onSetPrimary: (key: string) => void;
  disabled?: boolean;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/**
 * Drag-and-drop (or click-to-browse) image picker with instant previews. The
 * first/primary image is the product's main image; the rest form the gallery.
 * Persistence to disk is handled by the parent form on save.
 */
export function ImageUploader({
  images,
  onAddFiles,
  onRemove,
  onSetPrimary,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (files.length) onAddFiles(files);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    pickFiles(e.dataTransfer.files);
  }

  return (
    <div className="grid gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-input",
          disabled ? "opacity-50" : "cursor-pointer hover:bg-accent/40",
        )}
      >
        <ImagePlus className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">
          Drag &amp; drop images, or click to browse
        </p>
        <p className="text-muted-foreground text-xs">
          PNG, JPG, WEBP or GIF
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            pickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.key}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              <img
                src={img.src}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {img.isPrimary && (
                <Badge className="absolute left-1 top-1 gap-1 px-1.5 py-0 text-[10px]">
                  <Star className="size-3" /> Main
                </Badge>
              )}
              <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100">
                {!img.isPrimary && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    title="Set as main image"
                    onClick={() => onSetPrimary(img.key)}
                  >
                    <Star className="size-3.5" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  title="Remove image"
                  className="ml-auto"
                  onClick={() => onRemove(img.key)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
