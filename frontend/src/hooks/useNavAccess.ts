import { useAuth } from '../context/useAuth';

/** Mirrors the page gates in App.tsx so a card that opens another page only looks clickable when that page is reachable. */
export function useNavAccess() {
  const { hasPermission } = useAuth();
  return {
    products: hasPermission('products.view') || hasPermission('products'),
    purchases: hasPermission('purchases.view'),
    customers: hasPermission('customers.view') || hasPermission('customers'),
  };
}
