import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import LoginPage from './pages/LoginPage';
import ConsumersPage from './pages/ConsumersPage';
import DataSourcesPage from './pages/DataSourcesPage';
import LivePage from './pages/LivePage';
import HistoryPage from './pages/HistoryPage';
import StatsPage from './pages/StatsPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/consumers" replace />} />
          <Route path="/consumers" element={<ConsumersPage />} />
          <Route path="/data-sources" element={<DataSourcesPage />} />
          <Route path="/live" element={<LivePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/stats" element={<StatsPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
