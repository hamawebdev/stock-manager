import React, { lazy } from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/layout";
import "@/index.css";

// Route-level code splitting: each page loads its own chunk on demand, so the
// initial bundle stays small and heavy pages (product editor → jsbarcode,
// analytics → recharts / react-table) don't slow down app start.
const SellPage = lazy(() => import("@/pages/sell"));
const InventoryPage = lazy(() => import("@/pages/inventory"));
const ProductEditPage = lazy(() => import("@/pages/product-edit"));
const BestSellersPage = lazy(() => import("@/pages/best-sellers"));
const InventoryIntelligencePage = lazy(() => import("@/pages/inventory-intelligence"));
const BulkImportPage = lazy(() => import("@/pages/bulk-import"));
const ReturnsPage = lazy(() => import("@/pages/returns"));
const CashPage = lazy(() => import("@/pages/cash"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const SettingsPage = lazy(() => import("@/pages/settings"));

const queryClient = new QueryClient();

// HashRouter avoids deep-link 404s when the app is served from tauri://localhost.
const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <SellPage /> },
      { path: "inventory", element: <InventoryPage /> },
      { path: "inventory/new", element: <ProductEditPage /> },
      { path: "inventory/best-sellers", element: <BestSellersPage /> },
      { path: "inventory/intelligence", element: <InventoryIntelligencePage /> },
      { path: "inventory/import", element: <BulkImportPage /> },
      { path: "inventory/:id/edit", element: <ProductEditPage /> },
      { path: "returns", element: <ReturnsPage /> },
      { path: "cash", element: <CashPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
        <Toaster richColors />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
