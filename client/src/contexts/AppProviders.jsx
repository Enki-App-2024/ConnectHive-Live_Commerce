import { OrdersProvider } from "./OrdersContext";
import { ProductsProvider } from "./ProductsContext";
import { ModeratorsProvider } from "./ModeratorsContext";
import { PaymentsProvider } from "./PaymentContext";

function AppProviders({ children }) {
  return (
    <OrdersProvider>
      <ProductsProvider>
        <ModeratorsProvider>
          <PaymentsProvider>{children}</PaymentsProvider>
        </ModeratorsProvider>
      </ProductsProvider>
    </OrdersProvider>
  );
}

export default AppProviders;
