import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './integrations/supabase';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { DatasetsPage } from './pages/DatasetsPage';
import { PipelinesPage } from './pages/PipelinesPage';
import { DatasetDetailPage } from './pages/DatasetDetailPage';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060911] text-slate-300">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#3b63f6] border-t-transparent" />
          <span className="text-sm font-medium">Loading Groundwork...</span>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      <Route path="/dashboard" element={user ? <DashboardPage /> : <Navigate to="/" replace />} />
      <Route path="/datasets" element={user ? <DatasetsPage /> : <Navigate to="/" replace />} />
      <Route path="/pipelines" element={user ? <PipelinesPage /> : <Navigate to="/" replace />} />
      <Route
        path="/datasets/:id"
        element={user ? <DatasetDetailPage /> : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
