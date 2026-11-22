import { normalizeHistorySearch } from "../shared/historySearch";
import { RouteState } from "@/components/common/RouteState";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  lazyRouteComponent,
} from "@tanstack/react-router";
const HomePage = lazyRouteComponent(
  () => import("@/features/homepage/HomePage"),
  "HomePage",
);
const FeaturesPage = lazyRouteComponent(
  () => import("@/features/features/FeaturesPage"),
  "FeaturesPage",
);
const AboutPage = lazyRouteComponent(
  () => import("@/features/about/AboutPage"),
  "AboutPage",
);
const HistoryPage = lazyRouteComponent(
  () => import("@/features/history/HistoryPage"),
  "HistoryPage",
);
const DashboardPage = lazyRouteComponent(
  () => import("@/features/dashboard/DashboardPage"),
  "DashboardPage",
);
const TermsPage = lazyRouteComponent(
  () => import("@/features/legal/TermsPage"),
  "TermsPage",
);
const PrivacyPage = lazyRouteComponent(
  () => import("@/features/legal/PrivacyPage"),
  "PrivacyPage",
);
const AdminOverviewPage = lazyRouteComponent(
  () => import("@/features/admin/AdminOverviewPage"),
  "AdminOverviewPage",
);
const AdminServersPage = lazyRouteComponent(
  () => import("@/features/admin/AdminServersPage"),
  "AdminServersPage",
);
const AdminEmbedsPage = lazyRouteComponent(
  () => import("@/features/admin/AdminEmbedsPage"),
  "AdminEmbedsPage",
);
const AdminMonitorPage = lazyRouteComponent(
  () => import("@/features/admin/AdminMonitorPage"),
  "AdminMonitorPage",
);
const AdminDispatchPage = lazyRouteComponent(
  () => import("@/features/admin/AdminDispatchPage"),
  "AdminDispatchPage",
);
const AdminTestingPage = lazyRouteComponent(
  () => import("@/features/admin/AdminTestingPage"),
  "AdminTestingPage",
);
const AdminImagesPage = lazyRouteComponent(
  () => import("@/features/admin/AdminImagesPage"),
  "AdminImagesPage",
);
const AdminBotPage = lazyRouteComponent(
  () => import("@/features/admin/AdminBotPage"),
  "AdminBotPage",
);
const AdminWidgetsPage = lazyRouteComponent(
  () => import("@/features/admin/AdminWidgetsPage"),
  "AdminWidgetsPage",
);
const AdminMetadataPage = lazyRouteComponent(
  () => import("@/features/admin/AdminMetadataPage"),
  "AdminMetadataPage",
);
const AdminPagesPage = lazyRouteComponent(
  () => import("@/features/admin/AdminPagesPage"),
  "AdminPagesPage",
);
const AdminHeroPage = lazyRouteComponent(
  () => import("@/features/admin/AdminHeroPage"),
  "AdminHeroPage",
);
const ChangelogPage = lazyRouteComponent(
  () => import("@/features/changelog/ChangelogPage"),
  "ChangelogPage",
);
const AdminChangelogPage = lazyRouteComponent(
  () => import("@/features/admin/AdminChangelogPage"),
  "AdminChangelogPage",
);

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const featuresRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/features",
  component: FeaturesPage,
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: AboutPage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  validateSearch: normalizeHistorySearch,
  component: HistoryPage,
});

const historyIndexRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: "/",
  component: () => null,
});

const historyDetailRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: "/$packageId",
  component: () => null,
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

const adminPagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/pages",
  component: AdminPagesPage,
});

const adminHeroRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/hero",
  component: AdminHeroPage,
});

const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/changelog",
    component: ChangelogPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/changelog",
    component: AdminChangelogPage,
  }),
  indexRoute,
  featuresRoute,
  aboutRoute,
  historyRoute.addChildren([historyIndexRoute, historyDetailRoute]),
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
  adminPagesRoute,
  adminHeroRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultErrorComponent: () => <RouteState />,
  defaultNotFoundComponent: () => <RouteState missing />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
