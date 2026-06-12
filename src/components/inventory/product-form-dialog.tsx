import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useCategories,
  useCreateProduct,
  useUpdateProduct,
  useCurrency,
} from "@/lib/pos/queries";
import type { ProductInput } from "@/lib/pos/catalog";
import type { ProductSummary } from "@/lib/pos/catalog";
import { formatMoney, parseMoney } from "@/lib/money";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this product; otherwise it creates one. */
  product?: ProductSummary | null;
  /** Called with the new product id after a successful create. */
  onCreated?: (id: number) => void;
}

const NO_CATEGORY = "none";

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onCreated,
}: Props) {
  const isEdit = !!product;
  const currency = useCurrency();
  const categories = useCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");

  // Reset the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? "");
    setBrand(product?.brand ?? "");
    setCategoryId(product?.category_id ? String(product.category_id) : NO_CATEGORY);
    setDescription(product?.description ?? "");
    setPrice(product ? formatMoney(product.price_cents, { ...currency, symbol: "" }) : "");
    setCost(product ? formatMoney(product.cost_cents, { ...currency, symbol: "" }) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const priceCents = parseMoney(price || "0", currency.decimals);
    const costCents = parseMoney(cost || "0", currency.decimals);
    if (priceCents == null || costCents == null) {
      toast.error("Price and cost must be valid amounts");
      return;
    }
    const input: ProductInput = {
      name: name.trim(),
      brand: brand.trim() || null,
      category_id: categoryId === NO_CATEGORY ? null : Number(categoryId),
      description: description.trim() || null,
      price_cents: priceCents,
      cost_cents: costCents,
    };
    try {
      if (isEdit && product) {
        await updateProduct.mutateAsync({ id: product.id, input });
        toast.success("Product updated");
      } else {
        const id = await createProduct.mutateAsync(input);
        toast.success("Product created");
        onCreated?.(id);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(`Could not save: ${String(err)}`);
    }
  }

  const saving = createProduct.isPending || updateProduct.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            A product is a style; you'll add its size/color variants next.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Classic Crew Tee"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="p-brand">Brand</Label>
              <Input
                id="p-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                  {categories.data?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="p-price">
                Price{currency.symbol ? ` (${currency.symbol})` : ""}
              </Label>
              <Input
                id="p-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-cost">
                Cost{currency.symbol ? ` (${currency.symbol})` : ""}
              </Label>
              <Input
                id="p-cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea
              id="p-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
