import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ComboItem {
  id: number;
  label: string;
}

interface Props {
  items: ComboItem[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Inline create: receives the typed name, returns the new id to auto-select. */
  onCreate?: (name: string) => Promise<number>;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Singular noun for the "Create …" affordance, e.g. "category". */
  noun?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * Searchable single-select with an inline "+" to create-and-auto-select a new
 * entry without leaving the page. Used for Category and Supplier on the product
 * page (spec: inline create, newly created item auto-selected).
 */
export function EntityCombobox({
  items,
  value,
  onChange,
  onCreate,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  noun = "item",
  disabled,
  id,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = items.find((i) => i.id === value) ?? null;
  const q = query.trim();
  const filtered = q
    ? items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()))
    : items;
  const exactMatch = items.some((i) => i.label.toLowerCase() === q.toLowerCase());

  async function handleCreate() {
    if (!onCreate || !q || creating) return;
    setCreating(true);
    try {
      const newId = await onCreate(q);
      onChange(newId);
      setQuery("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  function openForCreate() {
    setOpen(true);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="flex-1 justify-between font-normal"
          >
            <span className={cn(!selected && "text-muted-foreground", "truncate")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {filtered.length === 0 && !onCreate && (
                <CommandEmpty>No results.</CommandEmpty>
              )}
              <CommandGroup>
                {filtered.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={String(item.id)}
                    onSelect={() => {
                      onChange(item.id === value ? null : item.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        item.id === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              {onCreate && q && !exactMatch && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value={`__create__${q}`}
                      onSelect={handleCreate}
                      disabled={creating}
                    >
                      <Plus className="mr-2 size-4" />
                      Create {noun} “{q}”
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {onCreate && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled}
          onClick={openForCreate}
          title={`Add ${noun}`}
          aria-label={`Add ${noun}`}
        >
          <Plus className="size-4" />
        </Button>
      )}
    </div>
  );
}
