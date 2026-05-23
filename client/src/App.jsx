import "./styles/global.css";
import "./styles/theme.css";
import "./styles/pages.css";
import "./styles/dashboard-layout.css";
import "./styles/live-session.css";
import "./styles/orders.css";
import "./styles/products.css";
import "./styles/moderators.css";
import "./styles/payments.css";
import "./styles/admin-panel.css";

import AppRoutes from "./routes/AppRoutes";
import AppProviders from "./contexts/AppProviders";

function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}

export default App;
