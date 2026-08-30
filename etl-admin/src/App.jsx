import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DataSourcesPage from './pages/DataSourcesPage';
import SyncJobsPage from './pages/SyncJobsPage';
import LogPage from './pages/LogPage';
import UsersPage from './pages/UsersPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/data-sources" element={<DataSourcesPage />} />
          <Route path="/sync-jobs" element={<SyncJobsPage />} />
          <Route path="/log" element={<LogPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
