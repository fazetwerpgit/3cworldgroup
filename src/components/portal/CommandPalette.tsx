'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgeDollarSign,
  BarChart3,
  BookOpen,
  Bug,
  CalendarClock,
  CheckSquare,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Link2,
  Mail,
  MessageSquare,
  MessagesSquare,
  PanelTop,
  ReceiptText,
  Search,
  Settings,
  SlidersHorizontal,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { Sale, UserRole } from '@/types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface PortalNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permissions?: string[];
  roles?: UserRole[];
}

export interface PortalNavGroup {
  label?: string;
  roles?: UserRole[];
  items: PortalNavItem[];
}

interface ActionDestination {
  label: string;
  href: string;
  permission?: string;
}

type PaletteRow = { key: string; label: string; href: string; meta?: string };

const managerRoles: UserRole[] = [
  'admin',
  'operations',
  'l1_manager',
  'l2_manager',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
  'general_manager',
  'office_manager',
];

const platformRoles: UserRole[] = ['admin', 'operations'];

// This is the single portal navigation source of truth. The sidebar, mobile
// sheet, and palette all consume these same labels, routes, and gates.
export const portalNavGroups: PortalNavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/portal/dashboard', icon: LayoutDashboard },
      { label: 'Sales', href: '/portal/sales', icon: BadgeDollarSign, permissions: ['sales:read'] },
      { label: 'Team Chat', href: '/portal/chat', icon: MessageSquare, permissions: ['chat:read'] },
      { label: 'Calls Schedule', href: '/portal/calls', icon: CalendarClock },
      { label: 'Leaderboard', href: '/portal/leaderboard', icon: Trophy, permissions: ['leaderboard:read'] },
      { label: 'My Onboarding', href: '/portal/onboarding', icon: ClipboardCheck, roles: ['entry_level_rep'] },
    ],
  },
  {
    label: 'Forms',
    items: [
      { label: 'Fiber Report', href: '/portal/fiber-report', icon: BarChart3 },
      { label: 'Expedite Order', href: '/portal/expedite-order', icon: Zap },
      { label: 'Payroll Dispute', href: '/portal/payroll-dispute', icon: ReceiptText },
      { label: 'Leads Request', href: '/portal/leads-request', icon: Users },
      { label: 'Manager Interview', href: '/portal/manager-interview', icon: CheckSquare, roles: managerRoles },
    ],
  },
  {
    label: 'Resources',
    items: [
      { label: 'University', href: '/portal/training', icon: GraduationCap, permissions: ['training:read'] },
      { label: 'Links', href: '/portal/links', icon: Link2, permissions: ['links:read'] },
      { label: 'Pay Structure', href: '/portal/pay-structure', icon: WalletCards },
    ],
  },
  {
    label: 'Operations',
    roles: managerRoles,
    items: [
      { label: 'Onboarding Review', href: '/portal/admin/onboarding', icon: ClipboardCheck, roles: platformRoles },
      { label: 'University Content', href: '/portal/admin/university', icon: BookOpen, roles: platformRoles },
      { label: 'Fiber Reports', href: '/portal/admin/fiber-reports', icon: BarChart3, roles: platformRoles },
      { label: 'Expedite Orders', href: '/portal/admin/expedite-orders', icon: Zap, roles: platformRoles },
      { label: 'Payroll Disputes', href: '/portal/admin/payroll-disputes', icon: ReceiptText, roles: platformRoles },
      { label: 'Manager Interviews', href: '/portal/admin/manager-interviews', icon: CheckSquare, roles: platformRoles },
      { label: 'Leads Requests', href: '/portal/admin/leads-requests', icon: Users, roles: platformRoles },
      { label: 'Recruiting Pipeline', href: '/portal/admin/pipeline', icon: PanelTop, roles: platformRoles },
      { label: 'Recruit Onboarding', href: '/portal/admin/recruiting', icon: UserPlus, roles: managerRoles },
      { label: 'Email Templates', href: '/portal/admin/email-templates', icon: Mail, roles: platformRoles },
      { label: 'Bug Reports', href: '/portal/admin/bug-reports', icon: Bug, roles: platformRoles },
    ],
  },
  {
    label: 'Admin',
    roles: ['admin'],
    items: [
      { label: 'User Management', href: '/portal/admin/users', icon: Users, permissions: ['users:read'] },
      { label: 'Form Options', href: '/portal/admin/form-options', icon: SlidersHorizontal },
      { label: 'Chat Channels', href: '/portal/admin/chat-channels', icon: MessagesSquare },
      { label: 'System Settings', href: '/portal/admin/settings', icon: Settings, permissions: ['settings:read'] },
    ],
  },
];

const actionDestinations: ActionDestination[] = [
  { label: 'Log a sale', href: '/portal/sales/new', permission: 'sales:write' },
  { label: 'Review pending sales', href: '/portal/sales?status=pending', permission: 'sales:approve' },
  { label: 'Report a bug', href: '/portal/settings#report-bug' },
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { user, hasPermission, isRole } = useAuth();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [sales, setSales] = useState<Sale[]>([]);
  const salesFetched = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Same gate PortalSidebar uses: role restriction wins, then permissions.
  const canAccess = useCallback(
    (item: PortalNavItem) => {
      if (item.roles && item.roles.length > 0 && !isRole(...item.roles)) return false;
      if (!item.permissions || item.permissions.length === 0) return true;
      return item.permissions.some((p) => hasPermission(p));
    },
    [isRole, hasPermission]
  );

  const pageDestinations = useMemo(() => {
    return portalNavGroups
      .filter((group) => !group.roles || isRole(...group.roles))
      .flatMap((group) => group.items)
      .filter(canAccess);
  }, [canAccess, isRole]);

  const actions = useMemo(
    () => actionDestinations.filter((a) => !a.permission || hasPermission(a.permission)),
    [hasPermission]
  );

  // Global Ctrl+K / ⌘K toggle — lives here so it works on every portal page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        onOpenChange(!openRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenChange]);

  // On open: reset, focus the input, and lock body scroll.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
    };
  }, [open]);

  // Fetch the sales list once, on first open, only when the user can read sales.
  // Mirrors useSales' fetchSales pattern (GET /api/portal/sales, read data.sales).
  useEffect(() => {
    if (!open || salesFetched.current || !hasPermission('sales:read')) return;
    salesFetched.current = true;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        params.append('limit', '50');
        // The list endpoint requires a verified login (sales carry customer PII).
        const token = await auth?.currentUser?.getIdToken();
        const response = await fetch(`/api/portal/sales?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch sales');
        if (!cancelled) setSales(Array.isArray(data.sales) ? data.sales : []);
      } catch {
        // Pages and actions stay usable even if the sales fetch fails; allow a
        // retry on the next open.
        salesFetched.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, hasPermission, user]);

  const q = query.trim().toLowerCase();

  const sections = useMemo(() => {
    // Token match: every whitespace-separated word must appear somewhere, so
    // a natural query like "log sale" still finds "Log a sale".
    const tokens = q.split(/\s+/).filter(Boolean);
    const matches = (text: string) => {
      const hay = text.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    };

    const result: { heading: string; rows: PaletteRow[] }[] = [];

    const pageRows = pageDestinations
      .filter((p) => matches(p.label))
      .map((p) => ({ key: `page:${p.href}`, label: p.label, href: p.href }));
    if (pageRows.length) result.push({ heading: 'Pages', rows: pageRows });

    const actionRows = actions
      .filter((a) => matches(a.label))
      .map((a) => ({ key: `action:${a.href}:${a.label}`, label: a.label, href: a.href }));
    if (actionRows.length) result.push({ heading: 'Actions', rows: actionRows });

    // Sales only surface with a real query (≥ 2 chars), matched on the
    // customer fields, capped at ~50 rows.
    if (hasPermission('sales:read') && q.length >= 2) {
      const saleRows = sales
        .filter((s) => {
          const haystack = [s.customerName, s.customerAddress, s.customerPhone]
            .filter(Boolean)
            .join(' ');
          return matches(haystack);
        })
        .slice(0, 50)
        .map((s) => ({
          key: `sale:${s.id}`,
          label: s.customerName || s.customerAddress || 'Unnamed sale',
          meta: s.status,
          href: `/portal/sales/${s.id}`,
        }));
      if (saleRows.length) result.push({ heading: 'Sales', rows: saleRows });
    }

    return result;
  }, [pageDestinations, actions, sales, q, hasPermission]);

  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  // Keep the active row valid as results shrink/grow.
  useEffect(() => {
    setActiveIndex((i) => (flat.length === 0 ? 0 : Math.min(i, flat.length - 1)));
  }, [flat.length]);

  // Keep the active row in view during keyboard navigation.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const select = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = flat[activeIndex];
      if (row) select(row.href);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="portal-enter relative mx-auto mt-[15vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-lg border border-white/10 bg-[#0A1F44]/90 text-white shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search pages, actions, customers…"
            className="h-12 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
            // Inline style: the portal-scope "inputs follow the theme" CSS rule
            // would otherwise paint this near-black on the navy glass in light
            // mode. The palette is always navy, so its text is always white.
            style={{ color: '#ffffff', caretColor: '#8dc63f' }}
            aria-label="Search"
          />
          <kbd className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/40">
            esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {flat.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-white/40">
              Nothing matches — try a customer name or page.
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.heading} className="mb-1 last:mb-0">
                <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {section.heading}
                </p>
                <ul>
                  {section.rows.map((row) => {
                    runningIndex += 1;
                    const index = runningIndex;
                    const active = index === activeIndex;
                    return (
                      <li key={row.key}>
                        <button
                          type="button"
                          ref={active ? activeRef : undefined}
                          onMouseMove={() => setActiveIndex(index)}
                          onClick={() => select(row.href)}
                          className={`relative flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors ${
                            active ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white'
                          }`}
                        >
                          {active && (
                            <span
                              className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[#8dc63f]"
                              aria-hidden="true"
                            />
                          )}
                          <span className="min-w-0 truncate">{row.label}</span>
                          {row.meta && (
                            <span className="shrink-0 text-xs capitalize text-white/40">
                              {row.meta}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
