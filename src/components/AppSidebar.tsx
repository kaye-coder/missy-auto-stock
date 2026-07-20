import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Tags,
  Users,
  Receipt,
  Settings,
  BarChart3,
  Truck,
  ShoppingBag,
  Wallet,
  BookOpen,
  Scale,
  UserCog,
} from "lucide-react";
import missyLogo from "@/lib/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { getSession, hasPermission, type ModuleKey } from "@/lib/auth";

type Item = { title: string; url: string; icon: typeof LayoutDashboard; module: ModuleKey | null };

const main: Item[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, module: null },
  { title: "Point of Sale", url: "/pos", icon: ShoppingCart, module: "pos" },
  { title: "Statistics", url: "/statistics", icon: BarChart3, module: "statistics" },
];

const manage: Item[] = [
  { title: "Inventory", url: "/inventory", icon: Package, module: "inventory" },
  { title: "Categories", url: "/categories", icon: Tags, module: "categories" },
  { title: "Customers", url: "/customers", icon: Users, module: "customers" },
  { title: "Suppliers", url: "/suppliers", icon: Truck, module: "suppliers" },
  { title: "Sales History", url: "/sales", icon: Receipt, module: "sales" },
  { title: "Settings", url: "/settings", icon: Settings, module: "settings" },
];

const finance: Item[] = [
  { title: "Purchases", url: "/purchases", icon: ShoppingBag, module: "purchases" },
  { title: "Expenses", url: "/expenses", icon: Wallet, module: "expenses" },
  { title: "Accounting", url: "/accounting", icon: BookOpen, module: "accounting" },
  { title: "Reconciliation", url: "/reconciliation", icon: Scale, module: "reconciliation" },
];

const admin: Item[] = [
  { title: "Users & Access", url: "/users", icon: UserCog, module: "users" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [, setBump] = useState(0);

  useEffect(() => {
    const h = () => setBump((n) => n + 1);
    window.addEventListener("missy:auth-changed", h);
    window.addEventListener("missy:users-changed", h);
    return () => {
      window.removeEventListener("missy:auth-changed", h);
      window.removeEventListener("missy:users-changed", h);
    };
  }, []);

  const isActive = (url: string) =>
    url === "/" ? path === "/" : path.startsWith(url);

  const isAdmin = getSession()?.role === "admin";
  const visible = (items: Item[]) =>
    items.filter((i) => i.module === null || hasPermission(i.module));

  const renderGroup = (label: string, items: Item[]) => {
    const filtered = visible(items);
    if (filtered.length === 0) return null;
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {filtered.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={isActive(item.url)}>
                  <Link to={item.url}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <img src={missyLogo.url} alt="Missy logo" className="h-10 w-10 object-contain" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight text-sidebar-foreground">Missy</span>
              <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
                Car Accessories
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Workspace", main)}
        {renderGroup("Manage", manage)}
        {renderGroup("Finance", finance)}
        {isAdmin && renderGroup("Admin", admin)}
      </SidebarContent>
    </Sidebar>
  );
}
