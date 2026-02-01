/**
 * Component Index
 * 
 * Centralized exports for all enhanced components
 * Based on Website implementation patterns
 */

// Portfolio Components
export { default as PortfolioSummaryCard } from './Portfolio/PortfolioSummaryCard';
export { default as ProfileHeroCards } from './Portfolio/ProfileHeroCards';

// Settings Components
export { default as AvatarUpload } from './Settings/AvatarUpload';

// Market Components
export { default as MarketCard } from './Markets/MarketCard';
export { default as MarketFilters } from './Markets/MarketFilters';
export { default as UserPositionsPanel } from './Markets/UserPositionsPanel';

// Legacy Components (already existing)
export { default as UserDashboard } from './UserDashboard';
export { default as LoadingSpinner } from './LoadingSpinner';

// Re-export types if needed
export type {
  // Add component prop types here if you want to export them
} from './types';
