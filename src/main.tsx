import React, { lazy } from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/layout";
import i18n, { dirFor } from "@/lib/i18n";
import { useAppStore } from "@/store/use-app-store";
import "@/index.css";

// Apply the persisted language/direction synchronously before the first paint so
// Arabic users don't see a flash of LTR. LanguageProvider keeps it in sync after.
const initialLanguage = useAppStore.getState().language;
void i18n.changeLanguage(initialLanguage);
document.documentElement.lang = initialLanguage;
document.documentElement.dir = dirFor(initialLanguage);

// Route-level code splitting: each page loads its own chunk on demand, so the
// initial bundle stays small and heavy pages (product editor → jsbarcode,
// analytics → recharts / react-table) don't slow down app start.
// The unified Payment Management Center replaces the old Sell / Returns / Cash
// pages; /returns and /cash now redirect here for any lingering deep links.
const PaymentsPage = lazy(() => import("@/pages/payments"));
const InventoryPage = lazy(() => import("@/pages/inventory"));
const ProductEditPage = lazy(() => import("@/pages/product-edit"));
const BestSellersPage = lazy(() => import("@/pages/best-sellers"));
const InventoryIntelligencePage = lazy(() => import("@/pages/inventory-intelligence"));
const BulkImportPage = lazy(() => import("@/pages/bulk-import"));
const PurchasingPage = lazy(() => import("@/pages/purchasing"));
const StudioPage = lazy(() => import("@/pages/studio"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const SettingsPage = lazy(() => import("@/pages/settings"));

const queryClient = new QueryClient();

// HashRouter avoids deep-link 404s when the app is served from tauri://localhost.
const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <PaymentsPage /> },
      { path: "inventory", element: <InventoryPage /> },
      { path: "inventory/new", element: <ProductEditPage /> },
      { path: "inventory/best-sellers", element: <BestSellersPage /> },
      { path: "inventory/intelligence", element: <InventoryIntelligencePage /> },
      { path: "inventory/import", element: <BulkImportPage /> },
      { path: "inventory/:id/edit", element: <ProductEditPage /> },
      { path: "returns", element: <Navigate to="/" replace /> },
      { path: "cash", element: <Navigate to="/" replace /> },
      { path: "purchasing", element: <PurchasingPage /> },
      { path: "studio", element: <StudioPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <RouterProvider router={router} />
          <Toaster richColors />
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
