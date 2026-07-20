import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { getSession, logout, refreshSession, type Session } from "@/lib/auth";
import { useRealtimeInvalidation } from "@/lib/realtime";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border border-input px-4 py-2 text-sm">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Missy" },
      { name: "description", content: "." },
      { property: "og:title", content: "Missy" },
      { name: "twitter:title", content: "Missy" },
      { property: "og:description", content: "." },
      { name: "twitter:description", content: "." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/2P6RtYC7pRRd3G7MuaSvTMR0i8s1/social-images/social-1782998042924-Screenshot_2026-07-02_153553.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/2P6RtYC7pRRd3G7MuaSvTMR0i8s1/social-images/social-1782998042924-Screenshot_2026-07-02_153553.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useRealtimeInvalidation(queryClient, !!session);

  useEffect(() => {
    setSession(getSession());
    setHydrated(true);
    refreshSession().then(setSession).catch(() => setSession(null));
    const sync = () => setSession(getSession());
    window.addEventListener("missy:auth-changed", sync);
    return () => {
      window.removeEventListener("missy:auth-changed", sync);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!session && pathname !== "/login") {
      router.navigate({ to: "/login", search: { redirect: pathname } });
    }
    if (session && pathname === "/login") {
      router.navigate({ to: "/" });
    }
  }, [hydrated, session, pathname, router]);

  const handleLogout = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await logout();
    router.navigate({ to: "/login" });
  };

  // Render login page without app shell
  if (pathname === "/login" || !session) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen w-full bg-background">
          <Outlet />
        </div>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <div className="flex flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
              <SidebarTrigger />
              <div className="text-sm font-medium text-muted-foreground">
                Missy <span className="mx-1 text-border">/</span>{" "}
                <span className="text-foreground">Shop Console</span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Signed in as <span className="font-medium text-foreground">{session.fullName || session.username}</span>
                  {session.role !== "admin" && <span className="ml-1 text-[10px] uppercase tracking-wide">({session.role})</span>}
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </Button>
              </div>
            </header>
            <main className="flex-1 px-4 py-6 sm:px-8">
              <Outlet />
            </main>
          </div>
        </div>
        <Toaster richColors position="top-right" />
      </SidebarProvider>
    </QueryClientProvider>
  );
}
