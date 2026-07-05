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
    // h-svh locks the shell to exactly the viewport height (the SidebarProvider
    // default is only min-h-svh, which lets a tall page grow the whole document
    // and scroll the body). With the shell bounded, the content area below scrolls
    // internally instead, so pages that pin footers/actions keep them in view.
    <SidebarProvider className="h-svh">
      <AdminSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ms-1" />
          <Separator orientation="vertical" className="me-2 h-4" />
        </header>
        {/* min-h-0 lets this flex child shrink to its bounded share so its own
            overflow-auto engages (a flex item defaults to min-height:auto, which
            would otherwise push the page taller than the viewport). */}
        <div className="min-h-0 flex-1 overflow-auto">
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
