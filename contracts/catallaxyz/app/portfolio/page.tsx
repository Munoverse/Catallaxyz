'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { getConnection, getProgram } from '../lib/solana';
import { useSigner } from '../hooks/useSigner';
import { useNotifications } from '../components/notifications';
import { formatUsdc, toNumber } from '../lib/utils';

const AUTO_REFRESH_MS = 60_000;

type PositionRow = {
  market: string;
  yes: number;
  no: number;
};

type BalanceRow = {
  market: string;
  usdc: number;
};

// AUDIT FIX v1.1.0: Define proper types for account data
interface UserPositionAccount {
  user: PublicKey | null;
  market: PublicKey | null;
  yesBalance: BN | number | null;
  noBalance: BN | number | null;
}

interface UserBalanceAccount {
  user: PublicKey | null;
  market: PublicKey | null;
  usdcBalance: BN | number | null;
}

interface ProgramAccountItem<T> {
  publicKey: PublicKey;
  account: T;
}

export default function PortfolioPage() {
  const { authenticated, loginWithMagic, magicError, resolveSigner } = useSigner();
  const { notify } = useNotifications();
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'market' | 'yes' | 'no' | 'usdc'>('market');

  const loadPortfolio = useCallback(async () => {
    const signer = await resolveSigner();
    if (!signer) {
      setPositions([]);
      setBalances([]);
      return;
    }
    try {
      setLoading(true);
      const connection = getConnection();
      const program = getProgram(connection, signer);
      const [positionAccounts, balanceAccounts] = await Promise.all([
        program.account.userPosition.all(),
        program.account.userBalance.all(),
      ]);
      const userKey = signer.publicKey.toString();
      // AUDIT FIX v1.1.0: Use proper types instead of any
      setPositions(
        (positionAccounts as ProgramAccountItem<UserPositionAccount>[])
          .filter((item) => item.account.user?.toString?.() === userKey)
          .map((item) => ({
            market: item.account.market?.toString?.() || 'Unknown',
            yes: toNumber(item.account.yesBalance) ?? 0,
            no: toNumber(item.account.noBalance) ?? 0,
          }))
      );
      setBalances(
        (balanceAccounts as ProgramAccountItem<UserBalanceAccount>[])
          .filter((item) => item.account.user?.toString?.() === userKey)
          .map((item) => ({
            market: item.account.market?.toString?.() || 'Unknown',
            usdc: toNumber(item.account.usdcBalance) ?? 0,
          }))
      );
    } catch (err: unknown) {
      // AUDIT FIX: Use unknown type with type guard
      const message = err instanceof Error ? err.message : 'Failed to load portfolio.';
      setError(message);
      notify('error', message);
    } finally {
      setLoading(false);
    }
  }, [resolveSigner, notify]);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    if (!authenticated) return;
    const interval = window.setInterval(() => {
      void loadPortfolio();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [authenticated, loadPortfolio]);

  const summary = useMemo(() => {
    const yes = positions.reduce((sum, p) => sum + p.yes, 0);
    const no = positions.reduce((sum, p) => sum + p.no, 0);
    const usdc = balances.reduce((sum, b) => sum + b.usdc, 0);
    return { yes, no, usdc };
  }, [positions, balances]);

  const filteredPositions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return positions.filter((position) =>
      !normalized ? true : position.market.toLowerCase().includes(normalized)
    );
  }, [positions, query]);

  const filteredBalances = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return balances.filter((balance) =>
      !normalized ? true : balance.market.toLowerCase().includes(normalized)
    );
  }, [balances, query]);

  const sortedPositions = useMemo(() => {
    const clone = [...filteredPositions];
    clone.sort((a, b) => {
      if (sortBy === 'yes') return b.yes - a.yes;
      if (sortBy === 'no') return b.no - a.no;
      return a.market.localeCompare(b.market);
    });
    return clone;
  }, [filteredPositions, sortBy]);

  const sortedBalances = useMemo(() => {
    const clone = [...filteredBalances];
    clone.sort((a, b) => {
      if (sortBy === 'usdc') return b.usdc - a.usdc;
      return a.market.localeCompare(b.market);
    });
    return clone;
  }, [filteredBalances, sortBy]);

  const handleExport = () => {
    const lines: string[] = [];
    lines.push('Type,Market,YES,NO,USDC');
    sortedPositions.forEach((position) => {
      lines.push(`Position,${position.market},${position.yes},${position.no},`);
    });
    sortedBalances.forEach((balance) => {
      lines.push(`Balance,${balance.market},,,${balance.usdc}`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify('success', 'Portfolio CSV exported.');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Portfolio</h1>
      <p className="text-gray-600 mb-6">
        YES: {formatUsdc(summary.yes)} · NO: {formatUsdc(summary.no)} · USDC: {formatUsdc(summary.usdc)}
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by market"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="market">Sort by market</option>
          <option value="yes">Sort by YES</option>
          <option value="no">Sort by NO</option>
          <option value="usdc">Sort by USDC</option>
        </select>
        <button
          onClick={() => loadPortfolio()}
          className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-black transition"
        >
          Refresh
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold"
        >
          Export CSV
        </button>
        <span className="text-xs text-gray-500">Auto-refresh every 60s when signed in.</span>
      </div>

      {!authenticated && (
        <button
          onClick={() => loginWithMagic()}
          className="mb-6 px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-black transition"
        >
          Continue with Google
        </button>
      )}
      {magicError && <div className="text-sm text-red-600 mb-4">{magicError}</div>}

      {loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700">
          Loading portfolio...
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {!loading && !error && positions.length === 0 && balances.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700">
          No positions or balances found for this wallet.
        </div>
      )}
      {!loading && !error && sortedPositions.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
            Positions
          </div>
          {sortedPositions.map((position) => (
            <div key={position.market} className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
              <div className="font-mono text-xs text-blue-600 truncate">{position.market}</div>
              <div>YES: {formatUsdc(position.yes)}</div>
              <div>NO: {formatUsdc(position.no)}</div>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && sortedBalances.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
            Balances
          </div>
          {sortedBalances.map((balance) => (
            <div key={balance.market} className="grid grid-cols-2 gap-4 px-4 py-3 text-sm">
              <div className="font-mono text-xs text-blue-600 truncate">{balance.market}</div>
              <div>USDC: {formatUsdc(balance.usdc)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
