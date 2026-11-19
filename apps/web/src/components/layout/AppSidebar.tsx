import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface AppSidebarProps {
  onNewDatasetClick?: () => void;
  activeItem?: 'overview' | 'projects' | 'datasets' | 'pipelines' | 'experiments';
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  onNewDatasetClick,
  activeItem,
}) => {
  const location = useLocation();

  // Determine active item based on current route if not explicitly passed
  const currentActive =
    activeItem ??
    (location.pathname.includes('/pipelines')
      ? 'pipelines'
      : location.pathname.includes('/datasets')
        ? 'datasets'
        : location.pathname.includes('/projects')
          ? 'projects'
          : 'overview');

  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      path: '/dashboard',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: 'projects',
      label: 'Projects',
      path: '/dashboard',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
    },
    {
      id: 'datasets',
      label: 'Datasets',
      path: '/dashboard',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7M4 7c0-2 1.5-3 3.5-3h9c2 0 3.5 1 3.5 3M4 7h16m-8 4v6m-4-3h8" />
        </svg>
      ),
    },
    {
      id: 'pipelines',
      label: 'Pipelines',
      path: '/pipelines',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    {
      id: 'experiments',
      label: 'Experiments',
      path: '/dashboard',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-30 flex w-60 flex-col border-r border-[#eaecf0] bg-white select-none">
      {/* Brand Header */}
      <div className="flex h-16 items-center px-6 border-b border-[#f2f4f7]">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3b5bf6] text-white shadow-xs">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-base font-bold text-slate-900 tracking-tight">Groundwork</span>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = currentActive === item.id;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                isActive
                  ? 'bg-[#eef2ff] text-[#3b5bf6] font-bold'
                  : 'text-slate-600 hover:bg-[#f9fafb] hover:text-slate-900'
              }`}
            >
              <span className={isActive ? 'text-[#3b5bf6]' : 'text-slate-400'}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Card: Agentic Data Prep (from Mockup) */}
      <div className="p-4 border-t border-[#f2f4f7]">
        <div className="rounded-xl border border-[#e0e7ff] bg-[#f5f8ff] p-3 text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-[#3b5bf6]">⚡</span>
            <span className="text-xs font-bold text-slate-900">Agentic Data Prep</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            AI agents for clean, ready-to-train datasets
          </p>
          {onNewDatasetClick && (
            <button
              type="button"
              onClick={onNewDatasetClick}
              className="mt-2.5 w-full rounded-lg bg-[#3b5bf6] py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#2e47d4] transition cursor-pointer"
            >
              + Upload Dataset
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
