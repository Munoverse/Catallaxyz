'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useRouter } from 'next/navigation';
import { MarketStatus } from '../../shared/types';
import {
  deriveGlobalPda,
  deriveCreatorTreasuryPda,
  deriveMarketVaultPda,
  deriveUserPositionPda,
  getConnection,
  getProgram,
  getProgramId,
} from '../lib/solana';
import { useSigner } from '../hooks/useSigner';
import { useNotifications } from '../components/notifications';
import { 
  formatStatus, 
  parseUsdcAmount, 
  toNumber,
  MarketRow,
  GlobalAccount,
  MarketAccount,
  MarketApiResponse,
} from '../lib/utils';
import { getMarketQuestion } from '../lib/market-metadata';
import { retryRpc } from '../lib/transactions';

const SWITCHBOARD_PROGRAM_ID = new PublicKey('SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv');

export default function MarketsPage() {
  const router = useRouter();
  const { notify } = useNotifications();
  const { authenticated, loginWithMagic, magicError, resolveSigner } = useSigner();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'settled' | 'terminated'>(
    'all'
  );
  const [sortBy, setSortBy] = useState<'created_desc' | 'created_asc' | 'trades_desc'>(
    'created_desc'
  );
  const [pageSize, setPageSize] = useState(10);
  const [globalAccount, setGlobalAccount] = useState<GlobalAccount | null>(null);
  const [selectedMarket, setSelectedMarket] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickStatus, setQuickStatus] = useState<string | null>(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickCheckTermination, setQuickCheckTermination] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const getMarketCheckKey = useCallback(
    (marketAddress: string) => `market:${marketAddress}:termination-check`,
    []
  );

  const loadMarkets = useCallback(async (cursor: string | null, append: boolean) => {
    try {
      if (!append) {
        setLoading(true);
        setMarkets([]);
      } else {
        setIsLoadingMore(true);
      }
      const connection = getConnection();
      const program = getProgram(connection);
      const globalPda = deriveGlobalPda(getProgramId());
      const global = await program.account.global.fetch(globalPda);
      setGlobalAccount(global);

      const params = new URLSearchParams();
      params.set('query', debouncedQuery.trim());
      params.set('status', statusFilter);
      params.set('sortBy', sortBy);
      params.set('limit', `${pageSize}`);
      if (cursor) {
        params.set('cursor', cursor);
      }
      const response = await fetch(`/api/markets?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load markets.');
      }
      const rows: MarketRow[] = (payload.markets ?? []).map((item: MarketApiResponse) => ({
        address: item.address,
        creator: item.creator ?? 'Unknown',
        status: item.status,
        createdAt: item.createdAt,
        totalTrades: item.totalTrades,
        question: item.question ?? getMarketQuestion(item.address),
      }));
      setMarkets((prev) => (append ? [...prev, ...rows] : rows));
      setNextCursor(payload.nextCursor ?? null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load markets.';
      setError(message);
      notify('error', message);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [debouncedQuery, notify, pageSize, sortBy, statusFilter]);

  useEffect(() => {
    void loadMarkets(null, false);
  }, [loadMarkets]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  const summary = useMemo(() => {
    const active = markets.filter((m) => m.status === MarketStatus.Active).length;
    const settled = markets.filter((m) => m.status === MarketStatus.Settled).length;
    const terminated = markets.filter((m) => m.status === MarketStatus.Terminated).length;
    return { total: markets.length, active, settled, terminated };
  }, [markets]);


  const selectedMarketInfo = useMemo(
    () => markets.find((market) => market.address === selectedMarket),
    [markets, selectedMarket]
  );

  const quickAmountBn = useMemo(() => parseUsdcAmount(quickAmount), [quickAmount]);

  const quickError = useMemo(() => {
    if (!selectedMarketInfo) return 'Select a market.';
    if (selectedMarketInfo.status !== MarketStatus.Active) {
      return 'Selected market is not active.';
    }
    if (!quickAmountBn || quickAmountBn.lte(new BN(0))) {
      return 'Enter a valid amount.';
    }
    return null;
  }, [selectedMarketInfo, quickAmountBn]);

  const handleQuickSplit = useCallback(async () => {
    if (quickError) {
      setQuickStatus(quickError);
      notify('error', quickError);
      return;
    }
    const signer = await resolveSigner();
    if (!signer || !globalAccount) {
      const message = 'Connect a wallet or Magic session first.';
      setQuickStatus(message);
      notify('error', message);
      return;
    }
    try {
      setQuickSubmitting(true);
      setQuickStatus('Submitting purchase...');
      const connection = getConnection();
      const program = getProgram(connection, signer);
      const programId = getProgramId();
      const globalPda = deriveGlobalPda(programId);
      const marketPublicKey = new PublicKey(selectedMarketInfo!.address);
      const marketVaultPda = deriveMarketVaultPda(programId, marketPublicKey);
      const userPosition = deriveUserPositionPda(programId, marketPublicKey, signer.publicKey);
      const userUsdcAccount = getAssociatedTokenAddressSync(
        globalAccount.usdcMint,
        signer.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );
      const tx = await retryRpc(() =>
        program.methods
          .splitPositionSingle({ amount: quickAmountBn! })
          .accounts({
            user: signer.publicKey,
            global: globalPda,
            market: marketPublicKey,
            userUsdcAccount,
            marketUsdcVault: marketVaultPda,
            userPosition,
            usdcMint: globalAccount.usdcMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc()
      );
      setQuickStatus(`Purchase submitted: ${tx}`);
      notify('success', 'Purchase submitted.');

      if (quickCheckTermination) {
        const marketAccount = await program.account.market.fetch(marketPublicKey) as unknown as MarketAccount;
        if (!marketAccount.randomTerminationEnabled) {
          setQuickStatus('Purchase submitted. Random termination is disabled for this market.');
          return;
        }

        const terminationProbability = toNumber(marketAccount.terminationProbability);
        if (terminationProbability === undefined || terminationProbability === null) {
          setQuickStatus('Purchase submitted. Unable to read termination probability.');
          return;
        }

        const lastYes = toNumber(marketAccount.lastTradeYesPrice) ?? 500_000;
        const lastNo = toNumber(marketAccount.lastTradeNoPrice) ?? 500_000;
        const lastSlot = toNumber(marketAccount.lastTradeSlot) ?? (await connection.getSlot());
        const settlementThreshold = new BN(terminationProbability).mul(new BN(100));

        const creatorTreasury = deriveCreatorTreasuryPda(programId);
        const creatorUsdcAccount = getAssociatedTokenAddressSync(
          globalAccount.usdcMint,
          marketAccount.creator,
          false,
          TOKEN_PROGRAM_ID
        );

        try {
          const terminationTx = await retryRpc(() =>
            program.methods
              .settleWithRandomness({
                settlementThreshold,
                lastTradeYesPrice: new BN(lastYes),
                lastTradeNoPrice: new BN(lastNo),
                lastTradeSlot: new BN(lastSlot),
                userOptedTerminationCheck: true,
              })
              .accounts({
                global: globalPda,
                market: marketPublicKey,
                creatorTreasury,
                creatorUsdcAccount,
                usdcMint: globalAccount.usdcMint,
                marketUsdcVault: marketVaultPda,
                randomnessAccount: marketAccount.randomnessAccount,
                caller: signer.publicKey,
                switchboardProgram: SWITCHBOARD_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
              })
              .rpc()
          );
          setQuickStatus(`Purchase submitted. Termination check: ${terminationTx}`);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Termination check failed.';
          setQuickStatus(`Purchase submitted. ${message}`);
          notify('error', message);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Purchase failed.';
      setQuickStatus(message);
      notify('error', message);
    } finally {
      setQuickSubmitting(false);
    }
  }, [globalAccount, notify, quickAmountBn, quickCheckTermination, quickError, resolveSigner, selectedMarketInfo]);

  useEffect(() => {
    if (!selectedMarket && markets.length > 0) {
      setSelectedMarket(markets[0].address);
      return;
    }
    if (typeof window === 'undefined' || !selectedMarket) return;
    const stored = window.localStorage.getItem(getMarketCheckKey(selectedMarket));
    setQuickCheckTermination(stored === 'false' ? false : true);
  }, [getMarketCheckKey, markets, selectedMarket]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Markets</h1>
      <p className="text-gray-600 mb-6">
        Total: {summary.total} · Active: {summary.active} · Settled: {summary.settled} · Terminated:{' '}
        {summary.terminated}
      </p>
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Quick Buy</h2>
          {!authenticated && (
            <button
              onClick={() => loginWithMagic()}
              className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-black transition"
            >
              Continue with Google
            </button>
          )}
        </div>
        {magicError && <div className="text-sm text-red-600">{magicError}</div>}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Market</label>
            <select
              value={selectedMarket}
              onChange={(e) => {
                setSelectedMarket(e.target.value);
                setQuickStatus(null);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {markets.map((market) => (
                <option key={market.address} value={market.address}>
                  {market.address.slice(0, 8)}...{market.address.slice(-6)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Amount (USDC)</label>
            <input
              value={quickAmount}
              onChange={(e) => {
                setQuickAmount(e.target.value);
                setQuickStatus(null);
              }}
              placeholder="10.0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Action</label>
            <button
              onClick={handleQuickSplit}
              disabled={!authenticated || Boolean(quickError) || quickSubmitting}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {quickSubmitting ? 'Submitting...' : 'Buy (Split)'}
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={quickCheckTermination}
              onChange={(e) => {
                const nextValue = e.target.checked;
                setQuickCheckTermination(nextValue);
                if (typeof window !== 'undefined' && selectedMarket) {
                  window.localStorage.setItem(getMarketCheckKey(selectedMarket), String(nextValue));
                }
              }}
              className="mt-1 h-4 w-4"
            />
            <span>
              Enable random termination check after purchases (default on). You can opt out to avoid
              the VRF check.
            </span>
          </label>
        </div>
        {quickStatus && <div className="text-sm text-gray-700">{quickStatus}</div>}
      </div>
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          placeholder="Search by market or creator"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="settled">Settled</option>
          <option value="terminated">Terminated</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="created_desc">Newest</option>
          <option value="created_asc">Oldest</option>
          <option value="trades_desc">Most trades</option>
        </select>
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
        </select>
        <button
          onClick={() => loadMarkets(null, false)}
          className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-black transition"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700">
          Loading markets...
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {!loading && !error && markets.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700">
          No markets found.
        </div>
      )}
      {!loading && !error && markets.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="grid grid-cols-12 gap-4 border-b border-gray-200 px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
            <div className="col-span-4">Market</div>
            <div className="col-span-3">Creator</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Created</div>
            <div className="col-span-1 text-right">Trades</div>
          </div>
          {markets.map((market) => (
            <button
              key={market.address}
              onClick={() => router.push(`/market/${market.address}`)}
              className="grid grid-cols-12 gap-4 px-4 py-3 text-sm hover:bg-gray-50 text-left"
            >
              <div className="col-span-4">
                <div className="font-mono text-xs text-blue-600 truncate">{market.address}</div>
                {market.question && (
                  <div className="text-xs text-gray-500 truncate">{market.question}</div>
                )}
              </div>
              <div className="col-span-3 font-mono text-xs text-gray-500 truncate">
                {market.creator}
              </div>
              <div className="col-span-2">{formatStatus(market.status)}</div>
              <div className="col-span-2 text-xs text-gray-500">
                {market.createdAt ? new Date(market.createdAt * 1000).toLocaleDateString() : '—'}
              </div>
              <div className="col-span-1 text-right">
                {market.totalTrades ?? 0}
              </div>
            </button>
          ))}
        </div>
      )}
      {!loading && !error && nextCursor && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => loadMarkets(nextCursor, true)}
            disabled={isLoadingMore}
            className="px-4 py-2 border border-gray-300 rounded text-sm font-semibold disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
