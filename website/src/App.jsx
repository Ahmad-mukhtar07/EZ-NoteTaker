import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionRefetchOnReturn } from './components/SubscriptionRefetchOnReturn';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CheckoutSuccessPage } from './pages/CheckoutSuccessPage';
import { CheckoutCancelPage } from './pages/CheckoutCancelPage';

export default function App() {
  return (
    <AuthProvider>
      <SubscriptionRefetchOnReturn />
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/success" element={<CheckoutSuccessPage />} />
        <Route path="/cancel" element={<CheckoutCancelPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          {/* Dashboard: available to any logged-in user. Page redirects to / if not authenticated. */}
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="privacy" element={<PrivacyPolicyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
