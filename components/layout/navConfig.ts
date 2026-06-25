import type { IconName } from "@/components/ui";

export type NavLink = {
  href: string;
  label: string;
  icon: IconName;
  adminOnly: boolean;
};

export type NavGroup = {
  label: string;
  links: NavLink[];
};

/**
 * Navigation grouped Sell / Manage / Insights / Admin. `adminOnly` links are
 * gated on currentUser.role === "admin".
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Sell",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: "home", adminOnly: false },
      { href: "/pos", label: "Point of Sale", icon: "shopping-cart", adminOnly: false },
      { href: "/receipts", label: "Receipts", icon: "receipt", adminOnly: false },
    ],
  },
  {
    label: "Manage",
    links: [
      { href: "/products", label: "Products", icon: "tag", adminOnly: true },
      { href: "/inventory", label: "Inventory", icon: "boxes", adminOnly: true },
      { href: "/inventory/health", label: "Health", icon: "gauge", adminOnly: true },
    ],
  },
  {
    label: "Insights",
    links: [
      { href: "/reports", label: "Reports", icon: "bar-chart", adminOnly: true },
      { href: "/audit", label: "Audit Log", icon: "history", adminOnly: true },
    ],
  },
  {
    label: "Admin",
    links: [
      { href: "/users", label: "Users", icon: "users", adminOnly: true },
    ],
  },
];

/** Cashier essentials surfaced in the phone bottom tab bar (thumb-reachable). */
export const BOTTOM_TAB_HREFS = ["/dashboard", "/pos", "/receipts"];

export const APP_TITLE = "MotorShop POS";
export const APP_SUBTITLE = "Sales & Inventory";
