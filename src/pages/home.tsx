import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { commands } from "@/lib/bindings";
import { addItem, deleteItem, listItems } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [itemName, setItemName] = useState("");
  const queryClient = useQueryClient();

  const items = useQuery({ queryKey: ["items"], queryFn: listItems });

  const add = useMutation({
    mutationFn: (value: string) => addItem(value),
    onSuccess: () => {
      setItemName("");
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["items"] }),
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Home</h2>
        <p className="text-muted-foreground">
          A starter demonstrating typed commands and a SQLite-backed list.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Typed command</CardTitle>
          <CardDescription>
            Calls the Rust <code>greet</code> command via tauri-specta bindings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setGreeting(await commands.greet(name));
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name..."
            />
            <Button type="submit">Greet</Button>
          </form>
          {greeting && <p className="mt-3 text-sm">{greeting}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items (SQLite)</CardTitle>
          <CardDescription>
            Persisted with <code>@tauri-apps/plugin-sql</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (itemName.trim()) add.mutate(itemName.trim());
            }}
          >
            <Input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="New item..."
            />
            <Button type="submit" disabled={add.isPending}>
              Add
            </Button>
          </form>

          {items.isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : items.data && items.data.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {items.data.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{item.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove.mutate(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No items yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
