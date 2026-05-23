import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePayments } from "../contexts/PaymentContext";

function ProtectedRoute({
  children,
  adminOnly = false,
  requireLiveAccess = false,
}) {
  const location = useLocation();
  const { user, loadingAuth, isAdmin } = useAuth();
  const { activeAccess } = usePayments();

  if (loadingAuth) {
    return (
      <main className="page-shell">
        <section className="page-card">
          <div className="page-kicker">LOADING</div>
          <h1 className="page-title">
            Checking your <span>session</span>
          </h1>
        </section>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireLiveAccess && !activeAccess.canUseLive) {
    return (
      <Navigate
        to="/payment"
        replace
        state={{
          from: location.pathname,
          accessMessage: activeAccess.lockReason,
          selectedPlan: activeAccess.plan,
        }}
      />
    );
  }

  return children;
}

export default ProtectedRoute;
