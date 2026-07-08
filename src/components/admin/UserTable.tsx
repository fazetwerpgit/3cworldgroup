'use client';

import Link from 'next/link';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { User } from '@/types';
import { isOnline } from '@/lib/presence/isOnline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface UserTableProps {
  users: User[];
  onStatusChange?: (userId: string, status: 'active' | 'inactive') => void;
  onApprove?: (userId: string) => void;
  onDelete?: (userId: string, userName: string) => void;
  loading?: boolean;
}

const statusColors = {
  active: 'border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1e] dark:text-green-300',
  pending:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300',
  inactive:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300',
};

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  operations: 'Operations',
  entry_rep: 'Account Executive',
  l1_manager: 'L1 Manager',
  l2_manager: 'L2 Manager',
  ibo_level_1: 'IBO Level 1',
  ibo_level_2: 'IBO Level 2',
  ibo_level_3: 'IBO Level 3',
  ibo_level_4: 'IBO Level 4',
};

export function UserTable({ users, onStatusChange, onApprove, onDelete, loading }: UserTableProps) {
  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (users.length === 0) {
    return (
      <Card className="rounded-lg border-slate-200 bg-white dark:border-border dark:bg-card text-center shadow-sm">
        <CardContent className="py-10">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-muted dark:text-muted-foreground">
            <UserPlus className="h-6 w-6" />
          </div>
          <p className="font-medium text-slate-950 dark:text-foreground">No users found</p>
          <Button asChild className="mt-4 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
            <Link href="/portal/admin/users/new">Add First User</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-lg border-slate-200 bg-white dark:border-border dark:bg-card py-0 shadow-sm">
      <Table>
        <TableHeader className="bg-slate-50 dark:bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
              User
            </TableHead>
            <TableHead className="px-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Role
            </TableHead>
            <TableHead className="px-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Status
            </TableHead>
            <TableHead className="px-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Hire Date
            </TableHead>
            <TableHead className="px-6 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow
              key={user.uid}
              className="border-slate-100 transition-colors hover:bg-slate-50 dark:border-border dark:hover:bg-muted/40"
            >
              <TableCell className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0A1F44] text-sm font-medium text-white">
                      {user.displayName?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span
                      title={isOnline(user.lastActiveAt) ? 'Active now' : 'Offline'}
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-card ${
                        isOnline(user.lastActiveAt) ? 'bg-[#8dc63f]' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-950 dark:text-foreground">
                      {user.displayName}
                    </div>
                    <div className="truncate text-sm text-slate-500 dark:text-muted-foreground">{user.email}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-700 dark:text-muted-foreground">
                {roleLabels[user.role ?? user.fieldRole ?? ''] ||
                  user.role ||
                  user.fieldRole}
              </TableCell>
              <TableCell className="px-6 py-4">
                <Badge
                  variant="outline"
                  className={
                    statusColors[user.status as keyof typeof statusColors] ||
                    'border-slate-200 bg-slate-100 text-slate-600 dark:border-border dark:bg-muted dark:text-muted-foreground'
                  }
                >
                  {user.status?.charAt(0).toUpperCase() + user.status?.slice(1) ||
                    'Unknown'}
                </Badge>
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-500 dark:text-muted-foreground">
                {formatDate(user.hireDate)}
              </TableCell>
              <TableCell className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/portal/admin/users/${user.uid}`}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Link>
                  </Button>
                  {onApprove && user.status === 'pending' && !user.fieldRole && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onApprove(user.uid)}
                      disabled={loading}
                      className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                    >
                      Approve
                    </Button>
                  )}
                  {onStatusChange && user.status === 'active' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onStatusChange(user.uid, 'inactive')}
                      disabled={loading}
                      className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/15 dark:hover:text-amber-200"
                    >
                      Deactivate
                    </Button>
                  )}
                  {onStatusChange && user.status === 'inactive' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onStatusChange(user.uid, 'active')}
                      disabled={loading}
                      className="border-[#8dc63f]/40 text-[#4f7f1e] dark:text-green-300 hover:bg-[#8dc63f]/10"
                    >
                      Activate
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onDelete(
                          user.uid,
                          user.displayName || user.email || 'this user'
                        )
                      }
                      disabled={loading}
                      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/15 dark:hover:text-red-200"
                      title="Delete user"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
