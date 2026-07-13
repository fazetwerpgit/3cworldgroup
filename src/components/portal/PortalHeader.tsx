'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Bug,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  LogOut,
  Megaphone,
  Search,
  Settings,
  Trophy,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CommandPalette } from '@/components/portal/CommandPalette';
import { useNotifications } from '@/hooks/useNotifications';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { NotificationType } from '@/types/notifications';
import { RoleDisplayNames, getEffectiveRole } from '@/types';

function getInitials(name?: string | null, email?: string | null) {
  const value = name?.trim() || email?.split('@')[0] || 'User';
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : value.slice(0, 2).toUpperCase();
}

export function PortalHeader() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  usePresenceHeartbeat();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.dataset.portalShell = 'on';
    return () => {
      delete document.body.dataset.portalShell;
    };
  }, []);

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
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const formatTimeAgo = (date: Date | string) => {
    const diffInSeconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const handleNotificationClick = (notificationId: string, link?: string) => {
    markAsRead([notificationId]);
    if (link) {
      setShowNotifications(false);
      router.push(link);
    }
  };

  const notificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'sale_approved':
        return <CheckCircle2 />;
      case 'sale_rejected':
      case 'onboarding_rejected':
        return <XCircle />;
      case 'sale_pending':
      case 'onboarding_submitted':
        return <ClipboardCheck />;
      case 'points_earned':
      case 'leaderboard_rank':
        return <Trophy />;
      case 'onboarding_approved':
        return <UserCheck />;
      case 'announcement':
        return <Megaphone />;
      case 'system':
      default:
        return <Bell />;
    }
  };

  return (
    <>
      <header className="portal-shell-header">
        <Link href="/portal/dashboard" className="portal-brand">
          <Image
            src="/logo.png"
            alt="3C World Group"
            width={28}
            height={28}
            priority
            className="portal-brand-logo"
          />
          <span className="portal-brand-copy">
            <strong>3C World Group / Employee Portal</strong>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="portal-search-trigger"
          aria-label="Search the portal"
        >
          <Search aria-hidden="true" />
          <span>Search the portal</span>
          <kbd>Ctrl K</kbd>
        </button>

        <div className="portal-header-actions">
          <div className="portal-header-popover" ref={notificationRef}>
            <button
              type="button"
              className="portal-header-button"
              onClick={() => setShowNotifications((open) => !open)}
              aria-expanded={showNotifications}
              aria-haspopup="true"
              aria-label="Notifications"
            >
              <Bell aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="portal-header-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>

            {showNotifications && (
              <div className="portal-notification-panel">
                <div className="portal-notification-header">
                  <h2>Notifications</h2>
                  {unreadCount > 0 && (
                    <button type="button" onClick={markAllAsRead}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="portal-notification-list">
                  {notifications.length === 0 ? (
                    <div className="portal-notification-empty">
                      <Bell aria-hidden="true" />
                      <p>No notifications yet</p>
                      <span>Updates from onboarding, sales, and operations will appear here.</span>
                    </div>
                  ) : (
                    notifications.slice(0, 10).map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => handleNotificationClick(notification.id, notification.link)}
                        className={`portal-notification-item${notification.read ? '' : ' is-unread'}`}
                      >
                        <span className="portal-notification-icon" aria-hidden="true">
                          {notificationIcon(notification.type)}
                        </span>
                        <span className="portal-notification-copy">
                          <strong>{notification.title}</strong>
                          <span>{notification.message}</span>
                          <small>{formatTimeAgo(notification.createdAt)}</small>
                        </span>
                        {!notification.read && <i aria-label="Unread notification" />}
                      </button>
                    ))
                  )}
                </div>
                {notifications.length > 0 && (
                  <button type="button" className="portal-notification-clear" onClick={clearAll}>
                    Clear all notifications
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="portal-header-popover" ref={dropdownRef}>
            <button
              type="button"
              className="portal-user-button"
              onClick={() => setShowDropdown((open) => !open)}
              aria-expanded={showDropdown}
              aria-haspopup="true"
              aria-label="User menu"
            >
              <span className="portal-avatar">{getInitials(user?.displayName, user?.email)}</span>
              <span className="portal-user-copy">
                <strong>{displayName}</strong>
                <small>{roleLabel}</small>
              </span>
              <ChevronDown className={showDropdown ? 'is-open' : undefined} aria-hidden="true" />
            </button>

            {showDropdown && (
              <div className="portal-user-menu">
                <div className="portal-user-menu-name">
                  <strong>{displayName}</strong>
                  <span>{user?.email}</span>
                </div>
                <Link href="/portal/settings" onClick={() => setShowDropdown(false)}>
                  <Settings aria-hidden="true" />
                  Settings
                </Link>
                <Link href="/portal/settings#report-bug" onClick={() => setShowDropdown(false)}>
                  <Bug aria-hidden="true" />
                  Report a Bug
                </Link>
                <button type="button" onClick={handleSignOut}>
                  <LogOut aria-hidden="true" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
