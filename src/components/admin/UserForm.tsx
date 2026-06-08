'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/contexts/AuthContext';
import { User, UserRole, getEffectiveRole, isPlatformRole } from '@/types';

interface UserFormProps {
  user?: User;
  isEdit?: boolean;
}

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'entry_rep', label: 'Entry Representative' },
  { value: 'l1_manager', label: 'L1 Manager' },
  { value: 'l2_manager', label: 'L2 Manager' },
  { value: 'operations', label: 'Operations' },
  { value: 'admin', label: 'Administrator' },
];

export function UserForm({ user, isEdit = false }: UserFormProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    email: user?.email || '',
    password: '',
    displayName: user?.displayName || '',
    role: getEffectiveRole(user) || ('entry_rep' as UserRole),
    phone: user?.phone || '',
    managerId: user?.reportsToId || '',
    status: user?.status || 'active',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const rolePayload = isPlatformRole(formData.role)
        ? { role: formData.role }
        : { fieldRole: formData.role };

      if (isEdit && user) {
        const response = await fetch(`/api/portal/auth/users/${user.uid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestedBy: currentUser?.uid,
            displayName: formData.displayName,
            ...rolePayload,
            phone: formData.phone,
            managerId: formData.managerId || null,
            status: formData.status,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to update user');
        }
      } else {
        if (!formData.password) {
          throw new Error('Password is required for new users');
        }

        const response = await fetch('/api/portal/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestedBy: currentUser?.uid,
            email: formData.email,
            password: formData.password,
            displayName: formData.displayName,
            ...rolePayload,
            phone: formData.phone,
            managerId: formData.managerId || null,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create user');
        }
      }

      router.push('/portal/admin/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Account Information</h2>
          <p className="text-sm text-slate-500">
            Basic account details used for sign-in and employee records.
          </p>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Email Address *
              </label>
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={isEdit}
                required
                placeholder="employee@3cworldgroup.com"
              />
              {isEdit && (
                <p className="mt-1 text-xs text-slate-500">
                  Email cannot be changed after creation.
                </p>
              )}
            </div>

            {!isEdit && (
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Password *
                </label>
                <Input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required={!isEdit}
                  minLength={6}
                  placeholder="Minimum 6 characters"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Display Name *
              </label>
              <Input
                type="text"
                name="displayName"
                value={formData.displayName}
                onChange={handleChange}
                required
                placeholder="John Smith"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Phone Number
              </label>
              <Input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-semibold text-slate-950">Role & Permissions</h2>
          <p className="text-sm text-slate-500">
            Choose the portal role and reporting assignment.
          </p>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Role *
              </label>
              <NativeSelect
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
                className="w-full"
              >
                {roleOptions.map((opt) => (
                  <NativeSelectOption key={opt.value} value={opt.value}>
                    {opt.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            {isEdit && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <NativeSelect
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full"
                >
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
                </NativeSelect>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Manager ID
              </label>
              <Input
                type="text"
                name="managerId"
                value={formData.managerId}
                onChange={handleChange}
                placeholder="Optional - Enter manager user ID"
              />
              <p className="mt-1 text-xs text-slate-500">
                Assign a manager for this user. This supports sales approval workflow.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading}
          className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
        >
          {loading ? 'Saving...' : isEdit ? 'Update User' : 'Create User'}
        </Button>
      </div>
    </form>
  );
}
