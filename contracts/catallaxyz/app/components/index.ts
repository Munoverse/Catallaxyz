/**
 * Component Exports Index
 * AUDIT FIX: Centralized exports for better import organization
 */

// ============================================
// Market Components
// ============================================
export {
  MarketInfo,
  UserPositionCard,
  BalanceManagement,
  TradingPanel,
  RedeemPanel,
  OrderbookDisplay,
  TradeHistory,
} from './market';

// ============================================
// UI Components
// ============================================
export { default as ActionButton } from './ui/ActionButton';
export { default as AmountInput } from './ui/AmountInput';
export { default as ConfirmDialog } from './ui/ConfirmDialog';
export { default as ErrorDisplay } from './ui/ErrorDisplay';
export { default as LoadingSpinner } from './ui/LoadingSpinner';

// ============================================
// Auth Components
// ============================================
export { default as LoginPromptModal } from './LoginPromptModal';
export { MagicAuth } from './magic-auth';

// ============================================
// Layout Components
// ============================================
export { default as Sidebar } from './Sidebar';
export { default as Providers } from './Providers';

// ============================================
// Utility Components
// ============================================
export { default as ErrorBoundary } from './ErrorBoundary';
export { NotificationProvider, useNotifications } from './notifications';

// ============================================
// Page Components
// ============================================
export { default as CreateMarketPage } from './CreateMarketPage';
