import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AdminSidebar } from "@/components/ui/admin-sidebar";

export default function Layout() {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <div className="flex-1 overflow-auto">
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="text-muted-foreground size-6 animate-spin" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
