import { memo } from 'react';
import { useTheme } from 'next-themes';
import { NavLink } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  ShoppingCart,
  Package,
  RotateCcw,
  Wallet,
  BarChart3,
  Settings,
  Moon,
  Sun,
  Store,
} from 'lucide-react';

const menuItems = [
  { title: 'Sell', icon: ShoppingCart, to: '/', end: true },
  { title: 'Inventory', icon: Package, to: '/inventory', end: false },
  { title: 'Returns', icon: RotateCcw, to: '/returns', end: false },
  { title: 'Cash', icon: Wallet, to: '/cash', end: false },
  { title: 'Reports', icon: BarChart3, to: '/reports', end: false },
  { title: 'Settings', icon: Settings, to: '/settings', end: false },
];

export const AdminSidebar = memo(() => {
  const { theme, setTheme } = useTheme();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Store className="h-5 w-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Atelier</span>
                  <span className="truncate text-xs">Point of Sale</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.to}>
                    <NavLink to={item.to} end={item.end}>
                      {({ isActive }) => (
                        <SidebarMenuButton isActive={isActive} tooltip={item.title}>
                          <Icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      )}
                    </NavLink>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Toggle theme"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
});

AdminSidebar.displayName = 'AdminSidebar';
