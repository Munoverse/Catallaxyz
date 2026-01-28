'use client';

/**
 * Market Detail Page
 * AUDIT FIX v1.2.1: Refactored to use extracted components
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Ed25519Program, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { MarketStatus } from '../../../shared/types';
import { useSigner } from '../../hooks/useSigner';
import { useNotifications } from '../../components/notifications';
import {
  deriveGlobalPda,
  derivePlatformTreasuryPda,
  deriveMarketVaultPda,
  deriveUserBalancePda,
  deriveUserPositionPda,
  deriveCreatorTreasuryPda,
  getConnection,
  getProgram,
  getProgramId,
  SignerLike,
} from '../../lib/solana';
import { 
  parseUsdcAmount, 
  toNumber,
  MarketAccount,
  GlobalAccount,
  OrderbookEntry,
  Order,
  Trade,
  UserPosition,
  UserPositionAccount,
  UserBalanceAccount,
  OutcomeType,
  TradeSide,
} from '../../lib/utils';
import { getMarketQuestion } from '../../lib/market-metadata';
import { buildCancelMessage, buildOrderMessage } from '../../lib/clob-order';
import { encodeSettleTradeMessage } from '../../lib/settle-trade';
import { retryRpc } from '../../lib/transactions';
// AUDIT FIX v1.2.6: Use centralized API functions with retry and timeout
import { apiGet, apiPost, apiDelete } from '../../lib/api';

// AUDIT FIX v1.2.1: Import extracted components
import {
  MarketInfo,
  UserPositionCard,
  BalanceManagement,
  TradingPanel,
  OrderbookPanel,
  SettleTradePanel,
  RedeemPanel,
} from '../../components/market';

type MarketDetailProps = {
  params: {
    id: string;
  };
};

export default function MarketDetailPage({ params }: MarketDetailProps) {
  const { authenticated, loginWithMagic, magicError, resolveSigner, signMessage } = useSigner();
  const { notify } = useNotifications();
  
  // Market state
  const [market, setMarket] = useState<MarketAccount | null>(null);
  const [global, setGlobal] = useState<GlobalAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketQuestion, setMarketQuestion] = useState<string | null>(null);
  
  // Form state
  const [splitAmount, setSplitAmount] = useState('');
  const [mergeAmount, setMergeAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeemOutcome, setRedeemOutcome] = useState<OutcomeType>('yes');
  
  // Trade form state
  const [tradeMaker, setTradeMaker] = useState('');
  const [tradeTaker, setTradeTaker] = useState('');
  const [tradeOutcome, setTradeOutcome] = useState<OutcomeType>('yes');
  const [tradeSide, setTradeSide] = useState<TradeSide>('buy');
  const [tradeSize, setTradeSize] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  
  // Order form state
  const [orderOutcome, setOrderOutcome] = useState<OutcomeType>('yes');
  const [orderSide, setOrderSide] = useState<TradeSide>('buy');
  const [orderSize, setOrderSize] = useState('');
  const [orderPrice, setOrderPrice] = useState('');
  
  // Orderbook state
  const [orderbookBuys, setOrderbookBuys] = useState<OrderbookEntry[]>([]);
  const [orderbookSells, setOrderbookSells] = useState<OrderbookEntry[]>([]);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  
  // UI state
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkTermination, setCheckTermination] = useState(true);
  
  // User state
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [userUsdcBalance, setUserUsdcBalance] = useState<number | null>(null);
  const [userCloxBalance, setUserCloxBalance] = useState<number | null>(null);

  const marketKey = useMemo(() => new PublicKey(params.id), [params.id]);
  const marketCheckKey = `market:${params.id}:termination-check`;

  // Derived market state
  const statusValue = market ? Number(market.status) : undefined;
  const isActive = statusValue === MarketStatus.Active && !market?.isPaused && !market?.isRandomlyTerminated;
  const terminationEnabled = Boolean(market?.randomTerminationEnabled);
  const canRedeem = Boolean(market?.canRedeem);

  // ============================================
  // Data Loading Callbacks
  // ============================================

  const loadMarketData = useCallback(async () => {
    try {
      const connection = getConnection();
      const program = getProgram(connection);
      const marketAccount = await program.account.market.fetch(marketKey);
      const globalPda = deriveGlobalPda(getProgramId());
      const globalAccount = await program.account.global.fetch(globalPda);
      setMarket(marketAccount as unknown as MarketAccount);
      setGlobal(globalAccount as unknown as GlobalAccount);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load market.';
      setError(message);
      notify('error', message);
    } finally {
      setLoading(false);
    }
  }, [marketKey, notify]);

  const loadUserData = useCallback(
    async (signer: SignerLike) => {
      try {
        const connection = getConnection();
        const program = getProgram(connection, signer);
        const programId = getProgramId();
        const userPositionPda = deriveUserPositionPda(programId, marketKey, signer.publicKey);
        const userBalancePda = deriveUserBalancePda(programId, marketKey, signer.publicKey);
        let positionAccount: UserPositionAccount | null = null;
        let balanceAccount: UserBalanceAccount | null = null;
        try {
          positionAccount = await program.account.userPosition.fetch(userPositionPda) as unknown as UserPositionAccount;
        } catch {
          positionAccount = null;
        }
        try {
          balanceAccount = await program.account.userBalance.fetch(userBalancePda) as unknown as UserBalanceAccount;
        } catch {
          balanceAccount = null;
        }
        // AUDIT FIX v1.2.6: Use correct field names matching Rust contract
        setUserPosition(
          positionAccount
            ? {
                yes: toNumber(positionAccount.yesBalance) ?? 0,
                no: toNumber(positionAccount.noBalance) ?? 0,
              }
            : null
        );
        setUserCloxBalance(toNumber(balanceAccount?.usdcBalance) ?? 0);
        if (global?.usdcMint) {
          const userUsdcAccount = getAssociatedTokenAddressSync(
            global.usdcMint,
            signer.publicKey,
            false,
            TOKEN_PROGRAM_ID
          );
          try {
            const balance = await connection.getTokenAccountBalance(userUsdcAccount);
            setUserUsdcBalance(Number(balance.value.amount));
          } catch {
            setUserUsdcBalance(0);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load user data.';
        setError(message);
        notify('error', message);
      }
    },
    [global?.usdcMint, marketKey, notify]
  );

  const refreshAll = useCallback(
    async (signer: SignerLike) => {
      await Promise.all([loadMarketData(), loadUserData(signer)]);
    },
    [loadMarketData, loadUserData]
  );

  // AUDIT FIX v1.2.6: Use apiGet with retry and timeout
  const loadOrderbook = useCallback(async () => {
    try {
      const outcomeType = orderOutcome === 'yes' ? 0 : 1;
      const result = await apiGet<{ buys: OrderbookEntry[]; sells: OrderbookEntry[] }>(
        `/api/clob/orderbook?market=${marketKey.toString()}&outcome=${outcomeType}`
      );
      if (!result.ok) {
        throw new Error(result.error || 'Failed to load orderbook.');
      }
      setOrderbookBuys(result.data?.buys ?? []);
      setOrderbookSells(result.data?.sells ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load orderbook.';
      notify('error', message);
    }
  }, [marketKey, notify, orderOutcome]);

  // AUDIT FIX v1.2.6: Use apiGet with retry and timeout
  const loadOpenOrders = useCallback(async () => {
    const signer = await resolveSigner();
    if (!signer) {
      setOpenOrders([]);
      return;
    }
    try {
      const result = await apiGet<{ orders: Order[] }>(
        `/api/clob/orders?market=${marketKey.toString()}&maker=${signer.publicKey.toString()}`
      );
      if (!result.ok) {
        throw new Error(result.error || 'Failed to load open orders.');
      }
      setOpenOrders(result.data?.orders ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load open orders.';
      notify('error', message);
    }
  }, [marketKey, notify, resolveSigner]);

  // AUDIT FIX v1.2.6: Use apiGet with retry and timeout
  const loadRecentTrades = useCallback(async () => {
    try {
      const result = await apiGet<{ trades: Trade[] }>(
        `/api/clob/trades?market=${marketKey.toString()}&limit=20`
      );
      if (!result.ok) {
        throw new Error(result.error || 'Failed to load trades.');
      }
      setRecentTrades(result.data?.trades ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load trades.';
      notify('error', message);
    }
  }, [marketKey, notify]);

  // ============================================
  // Effects
  // AUDIT FIX v1.2.6: Added cleanup functions to prevent memory leaks
  // ============================================

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await loadMarketData();
    };
    void load();
    return () => { cancelled = true; };
  }, [loadMarketData]);

  useEffect(() => {
    let cancelled = false;
    const refreshUser = async () => {
      if (cancelled) return;
      const signer = await resolveSigner();
      if (cancelled) return;
      if (signer) {
        await loadUserData(signer);
      } else {
        setUserPosition(null);
        setUserUsdcBalance(null);
        setUserCloxBalance(null);
      }
    };
    void refreshUser();
    return () => { cancelled = true; };
  }, [resolveSigner, loadUserData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(marketCheckKey);
    if (stored === 'false') {
      setCheckTermination(false);
    }
  }, [marketCheckKey]);

  useEffect(() => {
    const question = getMarketQuestion(params.id);
    setMarketQuestion(question ?? null);
  }, [params.id]);

  // AUDIT FIX v1.2.6: Use apiGet with retry and timeout
  useEffect(() => {
    let cancelled = false;
    const loadMarketMeta = async () => {
      try {
        const result = await apiGet<{ markets: Array<{ address: string; question?: string }> }>(
          `/api/markets?query=${encodeURIComponent(params.id)}&limit=1`
        );
        if (cancelled || !result.ok) return;
        const match = result.data?.markets?.find((item) => item.address === params.id);
        if (match?.question) {
          setMarketQuestion(match.question);
        }
      } catch (err: unknown) {
        // AUDIT FIX v1.2.2: Log error instead of completely silent catch
        // Fallback to localStorage question is still used
        if (!cancelled) {
          console.debug('Failed to load market meta from API, using localStorage fallback', err);
        }
      }
    };
    void loadMarketMeta();
    return () => { cancelled = true; };
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    const setDefaults = async () => {
      if (!authenticated) return;
      const signer = await resolveSigner();
      if (cancelled || !signer) return;
      const pubkey = signer.publicKey.toString();
      setTradeTaker((prev) => (prev ? prev : pubkey));
      setTradeMaker((prev) => (prev ? prev : pubkey));
    };
    void setDefaults();
    return () => { cancelled = true; };
  }, [authenticated, resolveSigner]);

  // AUDIT FIX v1.2.6: Add debounce to prevent excessive API calls
  const orderbookDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Clear any existing timeout
    if (orderbookDebounceRef.current) {
      clearTimeout(orderbookDebounceRef.current);
    }
    // Debounce by 150ms to prevent rapid consecutive calls
    orderbookDebounceRef.current = setTimeout(async () => {
      if (cancelled) return;
      await loadOrderbook();
    }, 150);
    return () => { 
      cancelled = true;
      if (orderbookDebounceRef.current) {
        clearTimeout(orderbookDebounceRef.current);
      }
    };
  }, [loadOrderbook]);

  const openOrdersDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (openOrdersDebounceRef.current) {
      clearTimeout(openOrdersDebounceRef.current);
    }
    openOrdersDebounceRef.current = setTimeout(async () => {
      if (cancelled) return;
      await loadOpenOrders();
    }, 150);
    return () => { 
      cancelled = true;
      if (openOrdersDebounceRef.current) {
        clearTimeout(openOrdersDebounceRef.current);
      }
    };
  }, [loadOpenOrders]);

  const tradesDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (tradesDebounceRef.current) {
      clearTimeout(tradesDebounceRef.current);
    }
    tradesDebounceRef.current = setTimeout(async () => {
      if (cancelled) return;
      await loadRecentTrades();
    }, 150);
    return () => { 
      cancelled = true;
      if (tradesDebounceRef.current) {
        clearTimeout(tradesDebounceRef.current);
      }
    };
  }, [loadRecentTrades]);

  // ============================================
  // Validation Memos
  // ============================================

  const splitAmountBn = useMemo(() => parseUsdcAmount(splitAmount), [splitAmount]);
  const mergeAmountBn = useMemo(() => parseUsdcAmount(mergeAmount), [mergeAmount]);
  const depositAmountBn = useMemo(() => parseUsdcAmount(depositAmount), [depositAmount]);
  const withdrawAmountBn = useMemo(() => parseUsdcAmount(withdrawAmount), [withdrawAmount]);
  const redeemAmountBn = useMemo(() => parseUsdcAmount(redeemAmount), [redeemAmount]);
  const tradeSizeBn = useMemo(() => parseUsdcAmount(tradeSize), [tradeSize]);
  const tradePriceBn = useMemo(() => parseUsdcAmount(tradePrice), [tradePrice]);
  const orderSizeBn = useMemo(() => parseUsdcAmount(orderSize), [orderSize]);
  const orderPriceBn = useMemo(() => parseUsdcAmount(orderPrice), [orderPrice]);

  const splitError = useMemo(() => {
    if (!splitAmountBn || splitAmountBn.lte(new BN(0))) return 'Enter a valid split amount.';
    if (userUsdcBalance !== null && splitAmountBn.gt(new BN(userUsdcBalance))) return 'Insufficient USDC balance.';
    return null;
  }, [splitAmountBn, userUsdcBalance]);

  const mergeError = useMemo(() => {
    if (!mergeAmountBn || mergeAmountBn.lte(new BN(0))) return 'Enter a valid merge amount.';
    if (userPosition) {
      const maxMerge = Math.min(userPosition.yes, userPosition.no);
      if (mergeAmountBn.gt(new BN(maxMerge))) return 'Insufficient YES/NO position balance.';
    }
    return null;
  }, [mergeAmountBn, userPosition]);

  const depositError = useMemo(() => {
    if (!depositAmountBn || depositAmountBn.lte(new BN(0))) return 'Enter a valid deposit amount.';
    if (userUsdcBalance !== null && depositAmountBn.gt(new BN(userUsdcBalance))) return 'Insufficient wallet USDC balance.';
    return null;
  }, [depositAmountBn, userUsdcBalance]);

  const withdrawError = useMemo(() => {
    if (!withdrawAmountBn || withdrawAmountBn.lte(new BN(0))) return 'Enter a valid withdraw amount.';
    if (userCloxBalance !== null && withdrawAmountBn.gt(new BN(userCloxBalance))) return 'Insufficient market balance.';
    return null;
  }, [withdrawAmountBn, userCloxBalance]);

  const redeemError = useMemo(() => {
    if (!canRedeem) return 'Redemption is not available yet.';
    if (!redeemAmountBn || redeemAmountBn.lte(new BN(0))) return 'Enter a valid redeem amount.';
    if (userPosition) {
      const maxRedeem = redeemOutcome === 'yes' ? userPosition.yes : userPosition.no;
      if (redeemAmountBn.gt(new BN(maxRedeem))) return 'Insufficient outcome balance.';
    }
    return null;
  }, [canRedeem, redeemAmountBn, redeemOutcome, userPosition]);

  const tradeError = useMemo(() => {
    if (!tradeMaker || !tradeTaker) return 'Enter maker and taker addresses.';
    if (!tradeSizeBn || tradeSizeBn.lte(new BN(0))) return 'Enter a valid trade size.';
    if (!tradePriceBn || tradePriceBn.lte(new BN(0)) || tradePriceBn.gt(new BN(1_000_000))) return 'Enter a valid trade price (0-1).';
    if (!global?.settlementSigner) return 'Missing settlement signer.';
    return null;
  }, [global?.settlementSigner, tradeMaker, tradePriceBn, tradeSizeBn, tradeTaker]);

  const orderError = useMemo(() => {
    if (!orderSizeBn || orderSizeBn.lte(new BN(0))) return 'Enter a valid order size.';
    if (!orderPriceBn || orderPriceBn.lte(new BN(0)) || orderPriceBn.gt(new BN(1_000_000))) return 'Enter a valid order price (0-1).';
    return null;
  }, [orderPriceBn, orderSizeBn]);

  // ============================================
  // Transaction Handlers
  // ============================================

  const handleSplit = useCallback(async () => {
    if (splitError) { setTxStatus(splitError); notify('error', splitError); return; }
    const signer = await resolveSigner();
    if (!signer || !global) { setTxStatus('Connect a wallet or Magic session first.'); notify('error', 'Connect a wallet or Magic session first.'); return; }
    try {
      setIsSubmitting(true);
      setTxStatus('Submitting split transaction...');
      const connection = getConnection();
      const program = getProgram(connection, signer);
      const programId = getProgramId();
      const tx = await program.methods
        .splitPositionSingle({ amount: splitAmountBn! })
        .accounts({
          user: signer.publicKey,
          global: deriveGlobalPda(programId),
          market: marketKey,
          userUsdcAccount: getAssociatedTokenAddressSync(global.usdcMint, signer.publicKey, false, TOKEN_PROGRAM_ID),
          marketUsdcVault: deriveMarketVaultPda(programId, marketKey),
          userPosition: deriveUserPositionPda(programId, marketKey, signer.publicKey),
          usdcMint: global.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setTxStatus(`Split submitted: ${tx}`);
      notify('success', 'Split transaction submitted.');
      await refreshAll(signer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Split failed.';
      setTxStatus(message);
      notify('error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [splitError, resolveSigner, global, marketKey, refreshAll, notify, splitAmountBn]);

  const handleMerge = useCallback(async () => {
    if (mergeError) { setTxStatus(mergeError); notify('error', mergeError); return; }
    const signer = await resolveSigner();
    if (!signer || !global) { setTxStatus('Connect a wallet or Magic session first.'); notify('error', 'Connect a wallet or Magic session first.'); return; }
    try {
      setIsSubmitting(true);
      setTxStatus('Submitting merge transaction...');
      const connection = getConnection();
      const program = getProgram(connection, signer);
      const programId = getProgramId();
      const tx = await program.methods
        .mergePositionSingle({ amount: mergeAmountBn! })
        .accounts({
          user: signer.publicKey,
          global: deriveGlobalPda(programId),
          market: marketKey,
          userUsdcAccount: getAssociatedTokenAddressSync(global.usdcMint, signer.publicKey, false, TOKEN_PROGRAM_ID),
          marketUsdcVault: deriveMarketVaultPda(programId, marketKey),
          userPosition: deriveUserPositionPda(programId, marketKey, signer.publicKey),
          usdcMint: global.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setTxStatus(`Merge submitted: ${tx}`);
      notify('success', 'Merge transaction submitted.');
      await refreshAll(signer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Merge failed.';
      setTxStatus(message);
      notify('error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [mergeError, resolveSigner, global, marketKey, refreshAll, notify, mergeAmountBn]);

  const handleDeposit = useCallback(async () => {
    if (depositError) { setTxStatus(depositError); notify('error', depositError); return; }
    const signer = await resolveSigner();
    if (!signer || !global) { setTxStatus('Connect a wallet or Magic session first.'); notify('error', 'Connect a wallet or Magic session first.'); return; }
    try {
      setIsSubmitting(true);
      setTxStatus('Submitting deposit...');
      const connection = getConnection();
      const program = getProgram(connection, signer);
      const programId = getProgramId();
      const tx = await program.methods
        .depositUsdc({ amount: depositAmountBn! })
        .accounts({
          user: signer.publicKey,
          global: deriveGlobalPda(programId),
          market: marketKey,
          userBalance: deriveUserBalancePda(programId, marketKey, signer.publicKey),
          userPosition: deriveUserPositionPda(programId, marketKey, signer.publicKey),
          marketUsdcVault: deriveMarketVaultPda(programId, marketKey),
          userUsdcAccount: getAssociatedTokenAddressSync(global.usdcMint, signer.publicKey, false, TOKEN_PROGRAM_ID),
          usdcMint: global.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setTxStatus(`Deposit submitted: ${tx}`);
      notify('success', 'Deposit submitted.');
      await refreshAll(signer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deposit failed.';
      setTxStatus(message);
      notify('error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [depositAmountBn, depositError, global, marketKey, notify, refreshAll, resolveSigner]);

  const handleWithdraw = useCallback(async () => {
    if (withdrawError) { setTxStatus(withdrawError); notify('error', withdrawError); return; }
    const signer = await resolveSigner();
    if (!signer || !global) { setTxStatus('Connect a wallet or Magic session first.'); notify('error', 'Connect a wallet or Magic session first.'); return; }
    try {
      setIsSubmitting(true);
      setTxStatus('Submitting withdraw...');
      const connection = getConnection();
      const program = getProgram(connection, signer);
      const programId = getProgramId();
      const tx = await program.methods
        .withdrawUsdc({ amount: withdrawAmountBn! })
        .accounts({
          user: signer.publicKey,
          global: deriveGlobalPda(programId),
          market: marketKey,
          userBalance: deriveUserBalancePda(programId, marketKey, signer.publicKey),
          marketUsdcVault: deriveMarketVaultPda(programId, marketKey),
          userUsdcAccount: getAssociatedTokenAddressSync(global.usdcMint, signer.publicKey, false, TOKEN_PROGRAM_ID),
          usdcMint: global.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setTxStatus(`Withdraw submitted: ${tx}`);
      notify('success', 'Withdraw submitted.');
      await refreshAll(signer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Withdraw failed.';
      setTxStatus(message);
      notify('error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [global, marketKey, notify, refreshAll, resolveSigner, withdrawAmountBn, withdrawError]);

  const handleRedeem = useCallback(async () => {
    if (redeemError) { setTxStatus(redeemError); notify('error', redeemError); return; }
    const signer = await resolveSigner();
    if (!signer || !global) { setTxStatus('Connect a wallet or Magic session first.'); notify('error', 'Connect a wallet or Magic session first.'); return; }
    try {
      setIsSubmitting(true);
      setTxStatus('Submitting redemption...');
      const connection = getConnection();
      const program = getProgram(connection, signer);
      const programId = getProgramId();
      const tx = await program.methods
        .redeemSingleOutcome({
          questionIndex: 0,
          outcomeType: redeemOutcome === 'yes' ? 0 : 1,
          tokenAmount: redeemAmountBn!,
        })
        .accounts({
          market: marketKey,
          userOutcomeToken: deriveUserPositionPda(programId, marketKey, signer.publicKey),
          marketVault: deriveMarketVaultPda(programId, marketKey),
          userUsdcAccount: getAssociatedTokenAddressSync(global.usdcMint, signer.publicKey, false, TOKEN_PROGRAM_ID),
          usdcMint: global.usdcMint,
          user: signer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setTxStatus(`Redemption submitted: ${tx}`);
      notify('success', 'Redemption submitted.');
      await refreshAll(signer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Redemption failed.';
      setTxStatus(message);
      notify('error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [global, marketKey, notify, redeemAmountBn, redeemError, redeemOutcome, refreshAll, resolveSigner]);

  // AUDIT FIX v1.2.6: Use apiPost with retry and timeout
  const submitFill = useCallback(
    async (
      signer: SignerLike,
      fill: { maker: string; taker: string; outcomeType: number; side: number; price: number; size: number }
    ) => {
      if (!global?.settlementSigner) throw new Error('Missing settlement signer.');
      const settleNonce = (toNumber(market?.settleTradeNonce) ?? 0) + 1;
      const result = await apiPost<{ signer: string; signature: number[] }>('/api/settle-trade', {
        market: marketKey.toString(),
        nonce: settleNonce,
        fill: { maker: fill.maker, taker: fill.taker, outcomeType: fill.outcomeType, side: fill.side, size: `${fill.size}`, price: `${fill.price}` },
      });
      if (!result.ok) throw new Error(result.error || 'Failed to sign trade.');
      const payload = result.data!;

      const settlementSigner = new PublicKey(global.settlementSigner);
      if (payload.signer && payload.signer !== settlementSigner.toString()) throw new Error('Settlement signer mismatch.');

      const signature = Uint8Array.from(payload.signature);
      const connection = getConnection();
      const program = getProgram(connection, signer);
      const programId = getProgramId();
      const makerKey = new PublicKey(fill.maker);
      const takerKey = new PublicKey(fill.taker);
      const fillInput = { maker: makerKey, taker: takerKey, outcomeType: fill.outcomeType, side: fill.side, size: new BN(fill.size), price: new BN(fill.price) };
      const message = encodeSettleTradeMessage({ market: marketKey, nonce: settleNonce, fill: fillInput });
      const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({ publicKey: settlementSigner.toBytes(), message, signature });

      return retryRpc(() =>
        program.methods
          .settleTrade({ fill: fillInput, nonce: new BN(settleNonce), signature: Array.from(signature) })
          .accounts({
            global: deriveGlobalPda(programId),
            market: marketKey,
            makerBalance: deriveUserBalancePda(programId, marketKey, makerKey),
            takerBalance: deriveUserBalancePda(programId, marketKey, takerKey),
            makerPosition: deriveUserPositionPda(programId, marketKey, makerKey),
            takerPosition: deriveUserPositionPda(programId, marketKey, takerKey),
            maker: makerKey,
            taker: takerKey,
            marketUsdcVault: deriveMarketVaultPda(programId, marketKey),
            platformTreasury: derivePlatformTreasuryPda(programId),
            creatorTreasury: deriveCreatorTreasuryPda(programId),
            usdcMint: global.usdcMint,
            instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .preInstructions([ed25519Ix])
          .rpc()
      );
    },
    [global, market, marketKey]
  );

  const handleSettleTrade = useCallback(async () => {
    if (tradeError) { setTxStatus(tradeError); notify('error', tradeError); return; }
    const signer = await resolveSigner();
    if (!signer || !global) { setTxStatus('Connect a wallet or Magic session first.'); notify('error', 'Connect a wallet or Magic session first.'); return; }
    try {
      setIsSubmitting(true);
      setTxStatus('Requesting trade signature...');
      const fill = {
        maker: tradeMaker,
        taker: tradeTaker,
        outcomeType: tradeOutcome === 'yes' ? 0 : 1,
        side: tradeSide === 'buy' ? 0 : 1,
        size: tradeSizeBn!.toNumber(),
        price: tradePriceBn!.toNumber(),
      };
      const tx = await submitFill(signer, fill);
      setTxStatus(`Trade settled: ${tx}`);
      notify('success', 'Trade settled.');
      await refreshAll(signer);
      await loadRecentTrades();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Trade settlement failed.';
      setTxStatus(message);
      notify('error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [global, notify, refreshAll, resolveSigner, submitFill, tradeError, tradeMaker, tradeOutcome, tradePriceBn, tradeSide, tradeSizeBn, tradeTaker, loadRecentTrades]);

  const handlePlaceOrder = useCallback(async () => {
    if (orderError) { setOrderStatus(orderError); notify('error', orderError); return; }
    const signer = await resolveSigner();
    if (!signer) { setOrderStatus('Connect a wallet or Magic session first.'); notify('error', 'Connect a wallet or Magic session first.'); return; }
    if (!signMessage) { setOrderStatus('Wallet does not support message signing.'); notify('error', 'Wallet does not support message signing.'); return; }
    try {
      setIsSubmitting(true);
      setOrderStatus('Placing order...');
      const outcomeType = orderOutcome === 'yes' ? 0 : 1;
      const nonce = `${Date.now()}`;
      const expiresAt = `${Date.now() + 10 * 60 * 1000}`;
      const orderMessage = buildOrderMessage({
        market: marketKey.toString(),
        outcome: outcomeType,
        side: orderSide,
        price: orderPriceBn!.toNumber(),
        size: orderSizeBn!.toNumber(),
        maker: signer.publicKey.toString(),
        nonce,
        expiresAt,
      });
      const signatureBytes = await signMessage(new TextEncoder().encode(orderMessage));
      const signature = btoa(String.fromCharCode(...signatureBytes));
      // AUDIT FIX v1.2.6: Use apiPost with retry and timeout
      const result = await apiPost<{
        orderbook?: { buys: OrderbookEntry[]; sells: OrderbookEntry[] };
        fills?: Array<{ maker: string; taker: string; outcomeType: number; side: number; price: number; size: number }>;
      }>('/api/clob/orderbook', {
        market: marketKey.toString(),
        outcome: outcomeType,
        side: orderSide,
        price: orderPriceBn!.toNumber(),
        size: orderSizeBn!.toNumber(),
        maker: signer.publicKey.toString(),
        nonce,
        expiresAt,
        signature,
      });
      if (!result.ok) throw new Error(result.error || 'Failed to place order.');
      const payload = result.data!;

      setOrderbookBuys(payload.orderbook?.buys ?? []);
      setOrderbookSells(payload.orderbook?.sells ?? []);

      const fills = payload.fills ?? [];
      if (fills.length === 0) {
        setOrderStatus('Order placed (resting).');
        await loadOpenOrders();
        return;
      }

      setOrderStatus(`Matched ${fills.length} fill(s). Settling...`);
      for (const fill of fills) {
        await submitFill(signer, fill);
      }
      setOrderStatus('Order matched and settled.');
      await refreshAll(signer);
      await loadOpenOrders();
      await loadRecentTrades();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Order placement failed.';
      setOrderStatus(message);
      notify('error', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [notify, orderError, orderOutcome, orderPriceBn, orderSide, orderSizeBn, refreshAll, resolveSigner, marketKey, loadOpenOrders, loadRecentTrades, submitFill, signMessage]);

  const handleCancelOrder = useCallback(
    async (orderId: string) => {
      const signer = await resolveSigner();
      if (!signer) { notify('error', 'Connect a wallet or Magic session first.'); return; }
      if (!signMessage) { notify('error', 'Wallet does not support message signing.'); return; }
      try {
        const timestamp = `${Date.now()}`;
        const message = buildCancelMessage({ orderId, maker: signer.publicKey.toString(), timestamp });
        const signatureBytes = await signMessage(new TextEncoder().encode(message));
        const signature = btoa(String.fromCharCode(...signatureBytes));
        // AUDIT FIX v1.2.6: Use apiDelete with retry and timeout
        const result = await apiDelete(
          `/api/clob/orders?id=${orderId}&maker=${signer.publicKey.toString()}&timestamp=${timestamp}&signature=${signature}`
        );
        if (!result.ok) throw new Error(result.error || 'Failed to cancel order.');
        notify('success', 'Order cancelled.');
        await loadOrderbook();
        await loadOpenOrders();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to cancel order.';
        notify('error', message);
      }
    },
    [loadOpenOrders, loadOrderbook, notify, resolveSigner, signMessage]
  );

  const handleCheckTerminationChange = useCallback((value: boolean) => {
    setCheckTermination(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(marketCheckKey, String(value));
    }
  }, [marketCheckKey]);

  // ============================================
  // Render
  // ============================================

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Market Detail</h1>
      <p className="text-gray-600 mb-6">
        Market address: <span className="font-mono">{params.id}</span>
      </p>

      {loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700">
          Loading market...
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* AUDIT FIX v1.2.1: Use extracted components */}
      <MarketInfo market={market} question={marketQuestion} />

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <button
          onClick={() => loadMarketData()}
          className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-black transition"
        >
          Refresh Market
        </button>
        {authenticated && (
          <button
            onClick={async () => {
              const signer = await resolveSigner();
              if (signer) await loadUserData(signer);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold"
          >
            Refresh My Data
          </button>
        )}
      </div>

      {authenticated && (
        <UserPositionCard
          position={userPosition}
          walletUsdcBalance={userUsdcBalance}
          marketUsdcBalance={userCloxBalance}
        />
      )}

      <BalanceManagement
        depositAmount={depositAmount}
        withdrawAmount={withdrawAmount}
        onDepositAmountChange={setDepositAmount}
        onWithdrawAmountChange={setWithdrawAmount}
        onDeposit={handleDeposit}
        onWithdraw={handleWithdraw}
        depositError={depositError}
        withdrawError={withdrawError}
        isSubmitting={isSubmitting}
        authenticated={authenticated}
        isActive={isActive}
      />

      <TradingPanel
        splitAmount={splitAmount}
        mergeAmount={mergeAmount}
        onSplitAmountChange={setSplitAmount}
        onMergeAmountChange={setMergeAmount}
        onSplit={handleSplit}
        onMerge={handleMerge}
        splitError={splitError}
        mergeError={mergeError}
        txStatus={txStatus}
        isSubmitting={isSubmitting}
        authenticated={authenticated}
        isActive={isActive}
        terminationEnabled={terminationEnabled}
        checkTermination={checkTermination}
        onCheckTerminationChange={handleCheckTerminationChange}
        onLogin={loginWithMagic}
        loginError={magicError}
      />

      <OrderbookPanel
        buys={orderbookBuys}
        sells={orderbookSells}
        openOrders={openOrders}
        recentTrades={recentTrades}
        orderOutcome={orderOutcome}
        orderSide={orderSide}
        orderPrice={orderPrice}
        orderSize={orderSize}
        orderError={orderError}
        orderStatus={orderStatus}
        onOrderOutcomeChange={setOrderOutcome}
        onOrderSideChange={setOrderSide}
        onOrderPriceChange={setOrderPrice}
        onOrderSizeChange={setOrderSize}
        onPlaceOrder={handlePlaceOrder}
        onCancelOrder={handleCancelOrder}
        isSubmitting={isSubmitting}
        authenticated={authenticated}
        isActive={isActive}
      />

      <SettleTradePanel
        tradeMaker={tradeMaker}
        tradeTaker={tradeTaker}
        tradeOutcome={tradeOutcome}
        tradeSide={tradeSide}
        tradeSize={tradeSize}
        tradePrice={tradePrice}
        tradeError={tradeError}
        onTradeMakerChange={setTradeMaker}
        onTradeTakerChange={setTradeTaker}
        onTradeOutcomeChange={setTradeOutcome}
        onTradeSideChange={setTradeSide}
        onTradeSizeChange={setTradeSize}
        onTradePriceChange={setTradePrice}
        onSettleTrade={handleSettleTrade}
        isSubmitting={isSubmitting}
        authenticated={authenticated}
        isActive={isActive}
      />

      <RedeemPanel
        redeemAmount={redeemAmount}
        redeemOutcome={redeemOutcome}
        onRedeemAmountChange={setRedeemAmount}
        onRedeemOutcomeChange={setRedeemOutcome}
        onRedeem={handleRedeem}
        redeemError={redeemError}
        isSubmitting={isSubmitting}
        authenticated={authenticated}
        canRedeem={canRedeem}
      />
    </div>
  );
}
