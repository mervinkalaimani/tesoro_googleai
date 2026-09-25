import { type ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ExportScopeProvider } from "@/lib/export-scope";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";
import { MobileNav } from "./mobile-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      {/* Wraps both halves: the page publishes the rows it is showing, the top
          bar's Export button reads them. */}
      <ExportScopeProvider>
        {/* No edge-swipe gesture. The bar at the bottom is the navigation on a
            phone, and the sidebar's trigger is hidden below md, so a swipe in
            from the edge was the one remaining door to a drawer that is not
            meant to be there — and it sat on top of every horizontal shelf on
            the page. */}
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset className="min-w-0 flex-1">
            <TopBar />
            {/* Room under the last row for the floating bar, plus whatever the
                phone reserves for its own home indicator. The bar is glass, so
                it has to be scrolled *past* rather than merely avoided — the
                padding is what lets the final card clear it. */}
            <main className="flex-1 pb-[calc(6.75rem+env(safe-area-inset-bottom))] md:pb-0">
              {children}
            </main>
          </SidebarInset>
        </div>
        <MobileNav />
      </ExportScopeProvider>
    </SidebarProvider>
  );
}
