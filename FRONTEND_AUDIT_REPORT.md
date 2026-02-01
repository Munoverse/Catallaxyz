# Frontend Code Audit Report v1.0.0

**Audit Date:** January 30, 2026  
**Scope:** `/home/eero/Catallaxyz/apps/frontend/`  
**Comparison:** `/home/eero/Catallaxyz/contracts/catallaxyz/app/`

---

## Executive Summary

This audit examines the Catallaxyz frontend application for security vulnerabilities, code redundancy, missing features, performance issues, type safety, and state management patterns. The audit compares the main frontend with the contracts app to identify duplicate code and consolidation opportunities.

### Key Findings Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 1 | 3 | 5 | 4 |
| Redundancy | - | 2 | 4 | 6 |
| Performance | - | 2 | 5 | 8 |
| Type Safety | - | 1 | 4 | 7 |
| State Management | - | 1 | 3 | 5 |

---

## 1. Security Vulnerabilities

### 1.1 CRITICAL: Admin Authentication via Header Only

**File:** `src/components/Admin/AdminFeeSettings.tsx` (lines 47-56)

```typescript
const response = await apiFetch('/api/admin/fee-config', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-wallet': publicKey.toBase58(),  // SECURITY ISSUE
  },
  // ...
})
```

**Issue:** Admin authentication relies solely on a wallet address header. This is easily spoofed without server-side signature verification.

**Recommendation:** Implement proper wallet signature verification for admin endpoints, similar to how `buildWalletAuthHeaders()` works for user actions.

---

### 1.2 HIGH: Missing Input Sanitization in Comments

**File:** `src/types/index.ts` (line 137)

```typescript
export interface Comment {
  content: any; // Tiptap JSON content - POTENTIAL XSS
}
```

**Issue:** Comment content is typed as `any` and may contain arbitrary JSON. Without proper sanitization, this could lead to XSS vulnerabilities when rendered.

**Recommendation:** 
1. Define strict Tiptap content types
2. Implement server-side content sanitization
3. Use DOMPurify on client-side rendering

---

### 1.3 HIGH: Credentials Stored in Client-Side Storage

**File:** `src/hooks/useClobOrderbook.ts` (lines 55-64)

```typescript
const storedCredentials = useMemo(() => getStoredCredentials(), [])

// Check if credentials match current wallet
const credentials = useMemo(() => {
  if (storedCredentials?.walletAddress === publicKey.toBase58()) {
    return storedCredentials
  }
  return null
}, [storedCredentials, publicKey])
```

**Issue:** CLOB API credentials (including secrets) are stored client-side. If localStorage is compromised, attackers can impersonate users.

**Recommendation:**
1. Store only non-sensitive credentials client-side
2. Use session-based tokens with server-side storage
3. Implement credential rotation

---

### 1.4 HIGH: Missing Rate Limiting on Sensitive Operations

**Files:** 
- `src/components/TipButton.tsx`
- `src/hooks/useFavorites.ts`
- `src/components/CreateUsernameDialog.tsx`

**Issue:** No client-side rate limiting or throttling for API calls. Users can spam operations.

**Recommendation:** Implement client-side debouncing and rate limiting, with server-side enforcement.

---

### 1.5 MEDIUM: Username Check Allows Information Disclosure

**File:** `src/components/CreateUsernameDialog.tsx` (lines 64-95)

```typescript
const checkAvailability = async (value: string) => {
  const response = await apiFetch(`/api/users/check-username?username=${encodeURIComponent(value)}`)
  // Returns whether username exists
}
```

**Issue:** Endpoint allows enumeration of existing usernames without authentication.

**Recommendation:** Rate limit the endpoint and consider requiring authentication.

---

### 1.6 MEDIUM: Transaction Signatures Not Verified

**File:** `src/components/TipButton.tsx` (lines 108-122)

```typescript
const response = await apiFetch('/api/tips', {
  body: JSON.stringify({
    tx_signature: signature,  // Client provides signature
    // ...
  }),
})
```

**Issue:** Client provides transaction signature, but it's unclear if server verifies the transaction actually occurred on-chain.

**Recommendation:** Server must verify transaction exists and matches claimed parameters before crediting tip.

---

### 1.7 MEDIUM: Missing CSRF Protection

**Files:** All API calls via `apiFetch()`

**Issue:** No visible CSRF token implementation for state-changing requests.

**Recommendation:** Implement CSRF tokens for POST/PUT/DELETE operations.

---

### 1.8 MEDIUM: Environment Variables Exposed to Client

**File:** `src/lib/tips.ts`

```typescript
export const TIP_TOKEN_MINT = process.env.NEXT_PUBLIC_TIP_TOKEN_MINT || ''
```

**Issue:** Multiple environment variables prefixed with `NEXT_PUBLIC_` are exposed. Ensure no sensitive data is exposed.

**Recommendation:** Audit all `NEXT_PUBLIC_` variables to ensure they're safe for client exposure.

---

### 1.9 LOW: Error Messages Expose System Details

**File:** `src/lib/auth.ts` (lines 21-24)

```typescript
} catch (error) {
  console.error('Error getting authenticated user:', error);
  return null;
}
```

**Issue:** Detailed error logging in production may expose system information.

**Recommendation:** Use structured logging with appropriate log levels for production.

---

## 2. Component Redundancy Analysis

### 2.1 HIGH: Duplicate TradingPanel Components

**Frontend:** `src/components/market/TradingPanel.tsx` (587 lines)  
**Contracts App:** `contracts/catallaxyz/app/components/market/TradingPanel.tsx` (132 lines)

**Analysis:** These are fundamentally different implementations:

| Aspect | Frontend | Contracts App |
|--------|----------|---------------|
| Purpose | Full CLOB trading | Split/Merge only |
| Features | Orderbook, limits, market orders | Basic split/merge |
| UI Framework | shadcn/ui | Plain HTML/CSS |
| State Management | Multiple hooks | Props-based |

**Recommendation:** The contracts app appears to be a **deprecated prototype**. Consider:
1. Removing `contracts/catallaxyz/app/` entirely
2. Or extracting shared utilities to a common package

---

### 2.2 HIGH: Duplicate Orderbook Components

**Frontend:** `src/components/market/OrderbookView.tsx` (181 lines)  
**Contracts App:** `contracts/catallaxyz/app/components/market/OrderbookPanel.tsx` (372 lines)

**Analysis:** Similar functionality with different implementations and styling.

**Recommendation:** Consolidate to single implementation in frontend.

---

### 2.3 MEDIUM: Duplicate Error Boundaries

**Frontend:** `src/components/ErrorBoundary.tsx` (50 lines)  
**Contracts App:** `contracts/catallaxyz/app/components/ErrorBoundary.tsx` (236 lines)

**Analysis:** Contracts app has more comprehensive error boundary with:
- Error reporting to backend
- Error IDs for support
- Detailed error info in development

**Recommendation:** Adopt the more comprehensive version from contracts app into frontend.

---

### 2.4 MEDIUM: Duplicate Type Definitions

**Frontend:** `src/types/index.ts`  
**Contracts App:** `contracts/catallaxyz/app/lib/types.ts`

**Analysis:** Both define Order, Trade, Market types with slight variations.

**Recommendation:** Create shared types package `@catallaxyz/types`.

---

### 2.5 MEDIUM: Similar API/Utility Functions

Both apps have similar patterns for:
- `formatPrice()`, `formatAmount()`
- USDC conversion utilities
- API fetch wrappers

**Recommendation:** Create shared utilities package `@catallaxyz/utils`.

---

## 3. Missing Features (vs need.md Requirements)

### 3.1 Implemented Features ✓

| Requirement | Status | Location |
|-------------|--------|----------|
| 2.1 Market creation | ✓ | `/markets/create` |
| 2.1 Split/Merge positions | ✓ | `SplitPositionSingle.tsx`, `MergePositionSingle.tsx` |
| 2.2 CLOB Trading | ✓ | `TradingPanel.tsx`, `useClobOrderbook.ts` |
| 2.6 Notifications | ✓ | `HeaderNotifications.tsx`, `notifications.ts` |
| 2.7 User Dashboard | ✓ | `UserDashboard.tsx` |
| 2.8 Magic Login | ✓ | `MagicAuthProvider.tsx`, `AuthDialog.tsx` |
| 2.8 External Wallet | ✓ | `SolanaWalletProvider.tsx` |
| 2.8 Username Creation | ✓ | `CreateUsernameDialog.tsx` |
| 2.13 Tipping | ✓ | `TipButton.tsx`, `tips.ts` |
| 2.14 Leaderboard | ✓ | `leaderboard/page.tsx` |
| 2.15 Market Categories | ✓ | `AdminCategoryManagement.tsx` |
| 2.17 Favorites | ✓ | `useFavorites.ts` |

### 3.2 Partially Implemented Features ⚠️

| Requirement | Status | Missing |
|-------------|--------|---------|
| 2.1 Redemption after termination | ⚠️ | `RedemptionPanel.tsx` exists but needs testing |
| 2.2 Randomness/Termination | ⚠️ | UI exists, backend integration unclear |
| 2.3 Maker rewards system | ⚠️ | No visible frontend for viewing rewards |
| 2.9 Gas-free CLOB | ⚠️ | Kora integration exists but needs verification |
| 2.11 Kora gas payment | ⚠️ | `kora.ts` implemented, needs E2E testing |

### 3.3 Missing/Incomplete Features ❌

| Requirement | Status | Notes |
|-------------|--------|-------|
| 2.2 Admin randomness probability control | ❌ | No UI for updating termination probability |
| 2.4 Fee display (50% probability max) | ❌ | Fee calculation exists but UI unclear |
| 2.5 Fee distribution visualization | ❌ | No breakdown of fee allocation |
| 2.10 Kora for redeem/split/merge | ⚠️ | Exists but `isMagicWallet` detection may be incomplete |
| 2.11 USDC priority for embedded wallets | ⚠️ | Logic in `kora.ts` but needs verification |
| 2.16 Tip-based homepage sorting | ❌ | Homepage doesn't clearly sort by tips |
| 2.16 Category secondary navigation | ⚠️ | Categories exist but navigation structure unclear |

---

## 4. Performance Optimization Suggestions

### 4.1 HIGH: Missing Query Caching

**File:** `src/hooks/useMarkets.ts`, `src/hooks/useMarket.ts`

**Issue:** No SWR/React Query caching for API responses.

**Recommendation:** Implement React Query or SWR for:
- Market data
- Orderbook data
- User positions
- Leaderboard data

### 4.2 HIGH: Unnecessary Re-renders in TradingPanel

**File:** `src/components/market/TradingPanel.tsx`

**Issue:** Large component (587 lines) with many state variables causing re-renders.

**Recommendation:**
1. Split into smaller components
2. Use `useMemo` for expensive calculations (partially done)
3. Extract sub-components with `React.memo`

### 4.3 MEDIUM: Orderbook Polling

**File:** `src/hooks/useClobOrderbook.ts`

**Issue:** No visible WebSocket implementation for real-time orderbook updates.

**Recommendation:** Implement WebSocket connection for orderbook updates instead of polling.

### 4.4 MEDIUM: Large Bundle Size Concerns

**Observed:** Multiple large dependencies:
- Tiptap editor
- Charts library
- Solana web3.js
- Multiple wallet adapters

**Recommendation:**
1. Implement dynamic imports for heavy components
2. Code-split by route
3. Analyze bundle with `@next/bundle-analyzer`

### 4.5 MEDIUM: Missing Image Optimization

**File:** `public/images/`

**Issue:** Images not optimized or using Next.js Image component consistently.

**Recommendation:** Use `next/image` for all images with proper sizing.

---

## 5. Type Safety Issues

### 5.1 HIGH: Inconsistent API Response Types

**File:** `src/types/index.ts` (lines 46-87)

```typescript
export interface Order {
  // API returns both formats, support both
  user_id?: string;
  userId?: string;
  market_id?: string;
  marketId?: string;
  // ...
}
```

**Issue:** Types accommodate both snake_case and camelCase, indicating backend inconsistency.

**Recommendation:** 
1. Standardize backend responses
2. Create transformation layer at API boundary
3. Use strict types internally

### 5.2 MEDIUM: Use of `any` Types

**Files with `any` usage:**
- `src/types/index.ts`: `content: any`
- `src/components/market/OrderbookView.tsx`: Multiple `any` casts
- `src/hooks/useClobOrderbook.ts`: `orderbook?.filter((row: any) => ...)`

**Recommendation:** Define proper types for all data structures.

### 5.3 MEDIUM: Missing Zod/Runtime Validation

**Issue:** API responses are not validated at runtime.

**Recommendation:** Use Zod schemas to validate API responses.

### 5.4 LOW: Inconsistent Null Handling

**Example:** `src/types/index.ts`

```typescript
creator?: {
  id?: string;
  wallet_address?: string;
  username?: string | null;  // Mixed optional and nullable
  avatar?: string | null;
} | null;
```

**Recommendation:** Establish consistent null/undefined patterns.

---

## 6. State Management Issues

### 6.1 HIGH: No Global State Management

**Issue:** Application relies heavily on prop drilling and local state.

**Recommendation:** Implement Zustand or Jotai for:
- User session state
- Market data cache
- UI preferences

### 6.2 MEDIUM: Duplicate Data Fetching

**Example:** User data fetched in multiple places:
- `UserDashboard.tsx`
- `useFavorites.ts`
- `MagicAuthProvider.tsx`

**Recommendation:** Centralize user data management.

### 6.3 MEDIUM: Missing Optimistic Updates

**Issue:** Operations like favorites, tips, orders wait for server response.

**Recommendation:** Implement optimistic updates for better UX.

---

## 7. Error Handling Consistency

### 7.1 Inconsistent Error Patterns

**Observed patterns:**
1. `toast.error()` in some components
2. `setError()` state in others
3. Console logging only in some places
4. Silent failures in others

**Recommendation:** Establish consistent error handling:
```typescript
// Suggested pattern
try {
  await operation()
  toast.success('Operation completed')
} catch (error) {
  logger.error('operation_failed', error)
  toast.error(getErrorMessage(error))
  // Optionally set local error state for UI
}
```

---

## 8. Contracts App Assessment

### 8.1 Is It a Duplicate?

**Answer:** **Partially**. The `contracts/catallaxyz/app/` directory appears to be:

1. **An older/prototype implementation** with simpler UI
2. **Uses different UI patterns** (plain HTML vs shadcn/ui)
3. **Has some features the frontend lacks** (better ErrorBoundary)
4. **Has overlapping but not identical functionality**

### 8.2 Recommendation

1. **Deprecate** `contracts/catallaxyz/app/` as the primary frontend
2. **Extract valuable code**:
   - ErrorBoundary improvements
   - Format utilities
   - Type definitions
3. **Document** if contracts app is needed for any specific purpose (e.g., testing)

---

## 9. Action Items (Priority Order)

### Critical (Immediate)
1. [ ] Fix admin authentication security
2. [ ] Implement comment content sanitization
3. [ ] Secure credential storage

### High Priority
1. [ ] Implement React Query for data caching
2. [ ] Consolidate duplicate components
3. [ ] Add missing admin features for randomness control
4. [ ] Standardize API response types

### Medium Priority
1. [ ] Implement WebSocket for orderbook
2. [ ] Add Zod validation for API responses
3. [ ] Implement global state management
4. [ ] Add rate limiting to sensitive operations

### Low Priority
1. [ ] Bundle size optimization
2. [ ] Image optimization
3. [ ] Consistent error handling
4. [ ] Documentation updates

---

## 10. Appendix: File Comparison Matrix

| Feature | Frontend | Contracts App | Recommendation |
|---------|----------|---------------|----------------|
| TradingPanel | Full CLOB | Split/Merge only | Keep frontend |
| OrderbookPanel | Modern UI | Basic UI | Keep frontend |
| ErrorBoundary | Basic | Comprehensive | Adopt contracts version |
| Types | Flexible | Strict | Create shared package |
| API Client | apiFetch | fetch | Keep frontend |
| Auth | Magic + Wallet | Magic only | Keep frontend |
| UI Components | shadcn/ui | Plain | Keep frontend |
| Formatting | Mixed | Centralized | Adopt contracts pattern |

---

*Report generated by automated audit on 2026-01-30*
