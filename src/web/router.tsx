import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { HomePage } from "@/features/homepage/HomePage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { TermsPage } from "@/features/legal/TermsPage";
import { PrivacyPage } from "@/features/legal/PrivacyPage";
import { AdminOverviewPage } from "@/features/admin/AdminOverviewPage";
import { AdminServersPage } from "@/features/admin/AdminServersPage";
import { AdminEmbedsPage } from "@/features/admin/AdminEmbedsPage";
import { AdminMonitorPage } from "@/features/admin/AdminMonitorPage";
import { AdminDispatchPage } from "@/features/admin/AdminDispatchPage";
import { AdminTestingPage } from "@/features/admin/AdminTestingPage";
import { AdminImagesPage } from "@/features/admin/AdminImagesPage";
import { AdminBotPage } from "@/features/admin/AdminBotPage";
import { AdminWidgetsPage } from "@/features/admin/AdminWidgetsPage";
import { AdminMetadataPage } from "@/features/admin/AdminMetadataPage";
import { AdminHeroPage } from "@/features/admin/AdminHeroPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms-of-service",
  component: TermsPage,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy-policy",
  component: PrivacyPage,
});

const adminOverviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminOverviewPage,
});

const adminServersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/servers",
  component: AdminServersPage,
});

const adminEmbedsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/embeds",
  component: AdminEmbedsPage,
});

const adminMonitorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/monitor",
  component: AdminMonitorPage,
});

const adminDispatchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/dispatch",
  component: AdminDispatchPage,
});

const adminTestingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/testing",
  component: AdminTestingPage,
});

const adminImagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/images",
  component: AdminImagesPage,
});

const adminBotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/bot",
  component: AdminBotPage,
});

const adminWidgetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/widgets",
  component: AdminWidgetsPage,
});

const adminMetadataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/metadata",
  component: AdminMetadataPage,
});

const adminHeroRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/hero",
  component: AdminHeroPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  historyRoute,
  dashboardRoute,
  termsRoute,
  privacyRoute,
  adminOverviewRoute,
  adminServersRoute,
  adminEmbedsRoute,
  adminMonitorRoute,
  adminDispatchRoute,
  adminTestingRoute,
  adminImagesRoute,
  adminBotRoute,
  adminWidgetsRoute,
  adminMetadataRoute,
  adminHeroRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
