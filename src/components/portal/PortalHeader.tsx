'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  Trophy,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useMobileMenu } from '@/contexts/MobileMenuContext';
import { NOTIFICATION_COLORS, NotificationType } from '@/types/notifications';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

export function PortalHeader() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { isOpen: isMobileMenuOpen, toggle: toggleMobileMenu } = useMobileMenu();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const effectiveRole = getEffectiveRole(user);
  const roleLabel = effectiveRole ? RoleDisplayNames[effectiveRole] : '';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date();
    const then = new Date(date);
    const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return then.toLocaleDateString();
  };

  const handleNotificationClick = (notificationId: string, link?: string) => {
    markAsRead([notificationId]);
    if (link) {
      setShowNotifications(false);
      router.push(link);
    }
  };

  const notificationIcon = (type: NotificationType) => {
    const className = 'h-4 w-4';
    switch (type) {
      case 'sale_approved':
        return <CheckCircle2 className={className} />;
      case 'sale_rejected':
      case 'onboarding_rejected':
        return <XCircle className={className} />;
      case 'sale_pending':
      case 'onboarding_submitted':
        return <ClipboardCheck className={className} />;
      case 'points_earned':
      case 'leaderboard_rank':
        return <Trophy className={className} />;
      case 'onboarding_approved':
        return <UserCheck className={className} />;
      case 'announcement':
        return <Megaphone className={className} />;
      case 'system':
      default:
        return <Bell className={className} />;
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMobileMenu}
          className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/portal/dashboard" className="flex items-center gap-3">
          <span className="hidden h-8 w-px bg-slate-200 lg:block" />
          <span className="hidden sm:block">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Employee Portal
            </span>
            <span className="block text-sm font-semibold leading-tight text-[#0A1F44]">
              Sales operations workspace
            </span>
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-md border border-transparent p-2 text-slate-500 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            aria-expanded={showNotifications}
            aria-haspopup="true"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-semibold text-slate-900">Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-[#5a8f1f] hover:text-[#4a7c19] font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <Bell className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-600 text-sm">No notifications yet</p>
                    <p className="text-slate-400 text-xs mt-1">
                      Updates from onboarding, sales, and operations will appear here.
                    </p>
                  </div>
                ) : (
                  notifications.slice(0, 10).map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification.id, notification.link)}
                      className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${
                        !notification.read ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        <span
                          className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                            NOTIFICATION_COLORS[notification.type] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {notificationIcon(notification.type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm ${
                              !notification.read ? 'font-medium text-slate-900' : 'text-slate-700'
                            }`}
                          >
                            {notification.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {notification.message}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {formatTimeAgo(notification.createdAt)}
                          </p>
                        </div>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {notifications.length > 0 && (
                <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
                  <Link
                    href="/portal/notifications"
                    onClick={() => setShowNotifications(false)}
                    className="text-sm text-[#5a8f1f] hover:text-[#4a7c19] font-medium block text-center"
                  >
                    View all notifications
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-3 rounded-md border border-transparent p-2 transition-colors hover:border-slate-200 hover:bg-slate-50"
            aria-expanded={showDropdown}
            aria-haspopup="true"
            aria-label="User menu"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#8dc63f]">
              <span className="text-sm font-semibold text-white">
                {user?.displayName?.charAt(0).toUpperCase() ||
                  user?.email?.charAt(0).toUpperCase() ||
                  'U'}
              </span>
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-slate-900">
                {user?.displayName || user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-500 transition-transform ${
                showDropdown ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showDropdown && (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-2 shadow-lg">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900">{user?.displayName || 'User'}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <Link
                href="/portal/settings"
                onClick={() => setShowDropdown(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
