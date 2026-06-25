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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useSizes,
  useColors,
  useCategories,
  useCreateSize,
  useCreateColor,
  useCreateCategory,
} from "@/lib/pos/queries";

export function LookupsCard() {
  const { t } = useTranslation();
  const sizes = useSizes();
  const colors = useColors();
  const categories = useCategories();
  const createSize = useCreateSize();
  const createColor = useCreateColor();
  const createCategory = useCreateCategory();

  const [sizeName, setSizeName] = useState("");
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#000000");
  const [catName, setCatName] = useState("");

  async function addSize() {
    if (!sizeName.trim()) return;
    try {
      await createSize.mutateAsync({
        name: sizeName.trim(),
        sortOrder: (sizes.data?.length ?? 0) + 1,
      });
      setSizeName("");
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function addColor() {
    if (!colorName.trim()) return;
    try {
      await createColor.mutateAsync({ name: colorName.trim(), hex: colorHex });
      setColorName("");
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function addCategory() {
    if (!catName.trim()) return;
    try {
      await createCategory.mutateAsync(catName.trim());
      setCatName("");
    } catch (err) {
      toast.error(String(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.lookups.title")}</CardTitle>
        <CardDescription>{t("settings.lookups.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sizes */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("settings.lookups.sizes")}</p>
          <div className="flex flex-wrap gap-1.5">
            {sizes.data?.map((s) => (
              <Badge key={s.id} variant="secondary">
                {s.name}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              className="max-w-40"
              value={sizeName}
              onChange={(e) => setSizeName(e.target.value)}
              placeholder={t("settings.lookups.sizePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && addSize()}
            />
            <Button variant="outline" size="sm" onClick={addSize}>
              <Plus /> {t("common.add")}
            </Button>
          </div>
        </div>

        {/* Colors */}
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{t("settings.lookups.colors")}</p>
          <div className="flex flex-wrap gap-1.5">
            {colors.data?.map((c) => (
              <Badge key={c.id} variant="secondary" className="gap-1.5">
                {c.hex && (
                  <span
                    className="size-2.5 rounded-full border"
                    style={{ backgroundColor: c.hex }}
                  />
                )}
                {c.name}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="color"
              className="h-9 w-12 p-1"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
            />
            <Input
              className="max-w-40"
              value={colorName}
              onChange={(e) => setColorName(e.target.value)}
              placeholder={t("settings.lookups.colorPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && addColor()}
            />
            <Button variant="outline" size="sm" onClick={addColor}>
              <Plus /> {t("common.add")}
            </Button>
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{t("settings.lookups.categories")}</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.data?.length ? (
              categories.data.map((c) => (
                <Badge key={c.id} variant="secondary">
                  {c.name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">{t("settings.lookups.noneYet")}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              className="max-w-40"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder={t("settings.lookups.categoryPlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <Button variant="outline" size="sm" onClick={addCategory}>
              <Plus /> {t("common.add")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
