'use client';

import type { ComponentType } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { Sale, SaleStatus } from '@/types';
import { auth } from '@/lib/firebase/config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface SaleDetailSheetProps {
  sale: Sale | null;
  /** Status→Badge-variant map, owned by SalesTable. */
  statusVariant: Record<SaleStatus, 'warning' | 'success' | 'danger' | 'secondary'>;
  /** Stale-age chip component, owned by SalesTable. */
  PendingAge: ComponentType<{ sale: Sale }>;
  /** Rep-initials helper, owned by SalesTable. */
  repInitials: (name: string) => string;
  /** 0-based position of `sale` within the currently rendered list. */
  index: number;
  /** Length of the currently rendered list. */
  total: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  canApprove: boolean;
  isAdmin: boolean;
  loading?: boolean;
  /** Approve in place — same handler the table row uses. */
  onApprove: (saleId: string) => void;
  /** Open the shared reject dialog owned by SalesTable. */
  onRequestReject: (saleId: string) => void;
  /** Open the shared delete dialog owned by SalesTable. */
  onRequestDelete: (saleId: string) => void;
}

const formatDate = (date: Date | string | undefined) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

/** Uppercase muted section label, matching the table's field-label treatment. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="portal-label text-[11px]">{label}</p>
      <div className="mt-1 text-sm text-slate-950 dark:text-foreground">{children}</div>
    </div>
  );
}

export function SaleDetailSheet({
  sale,
  statusVariant,
  PendingAge,
  repInitials,
  index,
  total,
  open,
  onOpenChange,
  onPrev,
  onNext,
  canPrev,
  canNext,
  canApprove,
  isAdmin,
  loading,
  onApprove,
  onRequestReject,
  onRequestDelete,
}: SaleDetailSheetProps) {
  const [proofLoading, setProofLoading] = useState(false);

  // Radix keeps the content mounted through the close animation; guard the body.
  if (!sale) {
    return <Sheet open={open} onOpenChange={onOpenChange} />;
  }

  const saleId = sale.id!;
  const showApproval = canApprove && sale.status === 'pending';

  const openScreenshot = async () => {
    if (!sale.proofScreenshotPath) return;
    setProofLoading(true);
    try {
      const t = await auth?.currentUser?.getIdToken();
      const res = await fetch(
        `/api/portal/forms/attachment?path=${encodeURIComponent(sale.proofScreenshotPath)}`,
        { headers: t ? { Authorization: `Bearer ${t}` } : undefined }
      );
      const json = await res.json();
      if (res.ok && json.url) window.open(json.url, '_blank', 'noopener');
    } finally {
      setProofLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="gap-3 border-b border-slate-100 p-5 pr-14 dark:border-border">
          <div className="flex items-start gap-2">
            <SheetTitle className="text-lg font-semibold text-slate-950 dark:text-foreground">
              {sale.customerName || sale.customerAddress || 'Customer pending'}
            </SheetTitle>
            <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
              <Badge variant={statusVariant[sale.status]} className="rounded-md">
                {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
              </Badge>
              <PendingAge sale={sale} />
            </span>
          </div>
          {total > 1 && (
            <div className="flex items-center gap-2">
              <span className="portal-num text-xs text-slate-500 dark:text-muted-foreground">
                {index + 1} of {total}
              </span>
              <span className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onPrev}
                  disabled={!canPrev}
                  title="Previous sale"
                  aria-label="Previous sale"
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onNext}
                  disabled={!canNext}
                  title="Next sale"
                  aria-label="Next sale"
                >
                  <ChevronDown className="size-4" />
                </Button>
              </span>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <Field label="Rep">
            <span className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#0A1F44]/8 text-[10px] font-semibold text-[#0A1F44] dark:bg-white/10 dark:text-white">
                {repInitials(sale.salesRepName)}
              </span>
              <span className="min-w-0 flex-1 truncate">{sale.salesRepName}</span>
            </span>
          </Field>

          <Field label="Sale date">
            <span className="portal-num">{formatDate(sale.saleDate)}</span>
          </Field>

          {sale.installDate && (
            <Field label="Install date">
              <span className="portal-num">{formatDate(sale.installDate)}</span>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-5">
            <Field label="Value">
              <span className="portal-num block text-right font-medium tabular-nums">
                {formatCurrency(sale.totalValue)}
              </span>
            </Field>
            <Field label="Commission">
              <span className="portal-num block text-right font-medium tabular-nums text-[#3f6212] dark:text-[#d7ecc0]">
                +{formatCurrency(sale.commission || 0)}
              </span>
            </Field>
          </div>

          {sale.customerPhone && (
            <Field label="Phone">
              <span className="portal-num">{sale.customerPhone}</span>
            </Field>
          )}
          {sale.customerEmail && <Field label="Email">{sale.customerEmail}</Field>}
          {sale.customerAddress && <Field label="Address">{sale.customerAddress}</Field>}

          {sale.productSold && <Field label="Product sold">{sale.productSold}</Field>}
          {sale.orderNumberOrBtn && (
            <Field label="Order # / BTN">
              <span className="portal-num">{sale.orderNumberOrBtn}</span>
            </Field>
          )}
          {sale.proofScreenshotPath && (
            <Field label="Screenshot">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openScreenshot}
                disabled={proofLoading}
              >
                {proofLoading ? 'Opening…' : 'View screenshot'}
              </Button>
            </Field>
          )}

          {sale.notes && (
            <Field label="Notes">
              <p className="whitespace-pre-wrap text-slate-700 dark:text-muted-foreground">
                {sale.notes}
              </p>
            </Field>
          )}
          {sale.rejectionReason && (
            <Field label="Rejection reason">
              <p className="whitespace-pre-wrap text-red-700 dark:text-red-300">
                {sale.rejectionReason}
              </p>
            </Field>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 p-5 dark:border-border">
          {showApproval && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onApprove(saleId)}
                disabled={loading}
                className="border-[#8dc63f]/40 text-[#3f6212] hover:bg-[#8dc63f]/10 hover:text-[#3f6212] dark:text-[#d7ecc0] dark:hover:bg-[#8dc63f]/15"
              >
                <Check className="size-4" />
                Approve
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onRequestReject(saleId)}
                disabled={loading}
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15"
              >
                <X className="size-4" />
                Reject
              </Button>
            </>
          )}
          {isAdmin && (
            <>
              <Button asChild variant="outline">
                <Link href={`/portal/sales/${saleId}/edit`}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onRequestDelete(saleId)}
                disabled={loading}
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </>
          )}
          <Button
            asChild
            variant="ghost"
            className="ml-auto text-slate-600 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground"
          >
            <Link href={`/portal/sales/${saleId}`}>
              Open full page
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
