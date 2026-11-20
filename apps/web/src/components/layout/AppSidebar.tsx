import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/integrations/supabase';

interface AppSidebarProps {
  onNewDatasetClick?: () => void;
  activeItem?: 'overview' | 'datasets' | 'pipelines';
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  onNewDatasetClick,
  activeItem,
}) => {
  const location = useLocation();
  const { user, profile, isDemoMode, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentActive: 'overview' | 'datasets' | 'pipelines' =
    activeItem ??
    (location.pathname.startsWith('/pipelines')
      ? 'pipelines'
      : location.pathname.startsWith('/datasets')
        ? 'datasets'
        : 'overview');

  const navItems: Array<{
    id: 'overview' | 'datasets' | 'pipelines';
    label: string;
    path: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'overview',
      label: 'Overview',
      path: '/dashboard',
      icon: (
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      ),
    },
    {
      id: 'datasets',
      label: 'Datasets',
      path: '/datasets',
      icon: (
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7M4 7c0-2 1.5-3 3.5-3h9c2 0 3.5 1 3.5 3M4 7h16m-8 4v6m-4-3h8"
          />
        </svg>
      ),
    },
    {
      id: 'pipelines',
      label: 'Pipelines',
      path: '/pipelines',
      icon: (
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
      ),
    },
  ];

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Workspace User';
  const avatarInitial = displayName.charAt(0).toUpperCase();

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200 select-none">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-5 border-b border-slate-200/80">
        <Link
          to="/dashboard"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2.5 text-base font-bold text-slate-900 tracking-tight font-display whitespace-nowrap"
        >
          <svg
            className="h-5 w-5 text-indigo-600"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="8" height="8" rx="1.75" fill="currentColor" />
            <rect x="13" y="3" width="8" height="8" rx="1.75" stroke="currentColor" strokeWidth="1.9" />
            <rect x="3" y="13" width="8" height="8" rx="1.75" stroke="currentColor" strokeWidth="1.9" />
            <rect x="13" y="13" width="8" height="8" rx="1.75" fill="#818CF8" />
          </svg>
          <span>Groundwork</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden cursor-pointer"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Primary Upload Action */}
      {onNewDatasetClick && (
        <div className="px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onNewDatasetClick();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600 whitespace-nowrap cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Upload Dataset</span>
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <nav aria-label="Workspace navigation" className="flex-1 px-3 py-3 space-y-1">
        {navItems.map((item) => {
          const isActive = currentActive === item.id;
          return (
            <Link
              key={item.id}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-50/80 text-indigo-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Account Footer */}
      <div className="border-t border-slate-200/80 p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">
            {avatarInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-slate-900">{displayName}</div>
            <div className="truncate text-[11px] text-slate-500">
              {isDemoMode ? 'Local Sandbox Mode' : (user?.email ?? 'Workspace Member')}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
        >
          {isDemoMode ? 'Exit Sandbox to Home' : 'Sign Out'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Bar Toggle (visible only < lg) */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-sm font-bold text-slate-900 font-display whitespace-nowrap"
        >
          <svg
            className="h-4 w-4 text-indigo-600"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="8" height="8" rx="1.75" fill="currentColor" />
            <rect x="13" y="3" width="8" height="8" rx="1.75" stroke="currentColor" strokeWidth="1.9" />
            <rect x="3" y="13" width="8" height="8" rx="1.75" stroke="currentColor" strokeWidth="1.9" />
            <rect x="13" y="13" width="8" height="8" rx="1.75" fill="#818CF8" />
          </svg>
          <span>Groundwork</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Desktop Fixed Left Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="w-64 max-w-[82vw] h-full shadow-xl">{sidebarContent}</div>
          <button
            type="button"
            aria-label="Close menu backdrop"
            onClick={() => setMobileOpen(false)}
            className="flex-1 bg-slate-900/40"
          />
        </div>
      )}
    </>
  );
};
