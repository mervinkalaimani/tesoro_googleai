import { type ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ExportScopeProvider } from "@/lib/export-scope";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";
import { EdgeSwipe } from "./edge-swipe";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      {/* Wraps both halves: the page publishes the rows it is showing, the top
          bar's Export button reads them. */}
      <ExportScopeProvider>
        {/* Swipe in from either edge to reach the navigation. */}
        <EdgeSwipe />
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset className="min-w-0 flex-1">
            <TopBar />
            <main className="flex-1">{children}</main>
          </SidebarInset>
        </div>
      </ExportScopeProvider>
    </SidebarProvider>
  );
}
