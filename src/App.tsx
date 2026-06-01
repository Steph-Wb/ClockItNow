import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TrackerPage from './pages/TrackerPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import ClientsPage from './pages/ClientsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import MagicLinkVerifyPage from './pages/MagicLinkVerifyPage';
import AppErrorBoundary from './components/ui/AppErrorBoundary';
import AuthGuard from './components/ui/AuthGuard';

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Öffentliche Routen */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/magic-link/verify" element={<MagicLinkVerifyPage />} />

          {/* Geschützte Routen */}
          <Route path="/*" element={
            <AuthGuard>
              <AppErrorBoundary>
                <div className="flex min-h-screen bg-background text-primary">
                  <Sidebar />
                  <main className="flex-1 p-6 overflow-auto">
                    <Routes>
                      <Route path="/" element={<TrackerPage />} />
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/clients" element={<ClientsPage />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>
                </div>
              </AppErrorBoundary>
            </AuthGuard>
          } />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
