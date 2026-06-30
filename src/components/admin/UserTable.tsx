'use client';

import Link from 'next/link';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { User } from '@/types';
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
  onDelete?: (userId: string, userName: string) => void;
  loading?: boolean;
}

const statusColors = {
  active: 'border-[#8dc63f]/40 bg-[#8dc63f]/10 text-[#4f7f1e]',
  inactive: 'border-red-200 bg-red-50 text-red-700',
};

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  operations: 'Operations',
  entry_rep: 'Account Executive',
  l1_manager: 'L1 Manager',
  l2_manager: 'L2 Manager',
};

export function UserTable({ users, onStatusChange, onDelete, loading }: UserTableProps) {
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
      <Card className="rounded-lg border-slate-200 bg-white text-center shadow-sm">
        <CardContent className="py-10">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <UserPlus className="h-6 w-6" />
          </div>
          <p className="font-medium text-slate-950">No users found</p>
          <Button asChild className="mt-4 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
            <Link href="/portal/admin/users/new">Add First User</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-lg border-slate-200 bg-white py-0 shadow-sm">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow className="hover:bg-slate-50">
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
              className="border-slate-100 transition-colors hover:bg-slate-50"
            >
              <TableCell className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A1F44] text-sm font-medium text-white">
                    {user.displayName?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-950">
                      {user.displayName}
                    </div>
                    <div className="truncate text-sm text-slate-500">{user.email}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-700">
                {roleLabels[user.role ?? user.fieldRole ?? ''] ||
                  user.role ||
                  user.fieldRole}
              </TableCell>
              <TableCell className="px-6 py-4">
                <Badge
                  variant="outline"
                  className={
                    statusColors[user.status as keyof typeof statusColors] ||
                    'border-slate-200 bg-slate-100 text-slate-600'
                  }
                >
                  {user.status?.charAt(0).toUpperCase() + user.status?.slice(1) ||
                    'Unknown'}
                </Badge>
              </TableCell>
              <TableCell className="px-6 py-4 text-sm text-slate-500">
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
                  {onStatusChange && user.status === 'active' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onStatusChange(user.uid, 'inactive')}
                      disabled={loading}
                      className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
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
                      className="border-[#8dc63f]/40 text-[#4f7f1e] hover:bg-[#8dc63f]/10"
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
                      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
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
