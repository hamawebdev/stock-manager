import { memo } from 'react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
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
  CreditCard,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  FileText,
  Moon,
  Sun,
  Store,
} from 'lucide-react';

const menuItems = [
  { key: 'nav.payments', icon: CreditCard, to: '/', end: true },
  { key: 'nav.inventory', icon: Package, to: '/inventory', end: false },
  { key: 'nav.purchasing', icon: ShoppingCart, to: '/purchasing', end: false },
  { key: 'nav.studio', icon: FileText, to: '/studio', end: false },
  { key: 'nav.reports', icon: BarChart3, to: '/reports', end: false },
  { key: 'nav.settings', icon: Settings, to: '/settings', end: false },
] as const;

export const AdminSidebar = memo(() => {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

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
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">{t('app.name')}</span>
                  <span className="truncate text-xs">{t('app.tagline')}</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.navigation')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const title = t(item.key);
                return (
                  <SidebarMenuItem key={item.to}>
                    <NavLink to={item.to} end={item.end}>
                      {({ isActive }) => (
                        <SidebarMenuButton isActive={isActive} tooltip={title}>
                          <Icon />
                          <span>{title}</span>
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
              tooltip={t('nav.toggleTheme')}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
              <span>{theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
});

AdminSidebar.displayName = 'AdminSidebar';
