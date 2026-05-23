import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Landing from "../pages/Landing";
import Signup from "../pages/Signup";
import Login from "../pages/Login";
import Plans from "../pages/Plans";
import PendingApproval from "../pages/PendingApproval";

import Dashboard from "../pages/Dashboard";
import LiveSession from "../pages/LiveSession";
import Orders from "../pages/Orders";
import Products from "../pages/Products";
import Moderators from "../pages/Moderators";
import Payments from "../pages/Payments";
import AdminPanel from "../pages/AdminPanel";

import ProtectedRoute from "./ProtectedRoute";

function protectedPage(Component, options = {}) {
  return (
    <ProtectedRoute adminOnly={options.adminOnly}>
      <Component />
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public onboarding */}
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/plans" element={<Plans />} />

        {/* Seller app */}
        <Route path="/dashboard" element={protectedPage(Dashboard)} />
        <Route path="/live" element={protectedPage(LiveSession)} />
        <Route path="/orders" element={protectedPage(Orders)} />
        <Route path="/products" element={protectedPage(Products)} />
        <Route path="/moderators" element={protectedPage(Moderators)} />
        <Route path="/payments" element={protectedPage(Payments)} />

        {/* Backward-compatible alias from plan selection */}
        <Route path="/payment" element={protectedPage(Payments)} />

        {/* Verification result */}
        <Route path="/pending" element={protectedPage(PendingApproval)} />

        {/* Admin */}
        <Route path="/admin" element={protectedPage(AdminPanel, { adminOnly: true })} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
