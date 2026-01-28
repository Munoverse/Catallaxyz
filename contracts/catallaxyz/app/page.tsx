'use client';

import { useRouter } from 'next/navigation';
import { UnifiedWalletButton } from '@jup-ag/wallet-adapter';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMagicAuth } from './components/magic-auth';

export default function Home() {
  const { connected } = useWallet();
  const { isMagicAuthenticated, loginWithMagic, error } = useMagicAuth();
  const authenticated = connected || isMagicAuthenticated;
  const router = useRouter();

  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          catallaxyz Prediction Markets
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Decentralized prediction markets on Solana.
        </p>
        <div className="flex gap-4 justify-center">
          {!authenticated ? (
            <>
              <button
                onClick={() => loginWithMagic()}
                className="px-8 py-3 bg-gray-900 text-white rounded-lg font-semibold hover:bg-black transition"
              >
                Continue with Google
              </button>
              <UnifiedWalletButton className="px-8 py-3 rounded-lg font-semibold" />
            </>
          ) : (
            <button
              onClick={() => router.push('/create-market')}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              Create Market
            </button>
          )}
          <button
            onClick={() => router.push('/markets')}
            className="px-8 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:border-blue-600 hover:text-blue-600 transition"
          >
            Browse Markets
          </button>
        </div>
        {error && <div className="text-sm text-red-600 mt-4">{error}</div>}
      </div>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-8 mb-16">
        <div className="bg-white rounded-lg p-6 shadow-lg card-hover">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">Fast Trading</h3>
          <p className="text-gray-600">
            High-throughput execution on Solana with near-instant confirmations.
          </p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-lg card-hover">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">Secure and Reliable</h3>
          <p className="text-gray-600">
            Smart contracts and on-chain custody help protect funds.
          </p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-lg card-hover">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">Easy to Use</h3>
          <p className="text-gray-600">
            Supports popular Solana wallets for convenient asset management.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-3xl font-bold mb-8 text-center">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              1
            </div>
            <h3 className="font-semibold mb-2">Sign In</h3>
            <p className="text-sm text-gray-600">
              Use email or social login and a wallet is created for you.
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              2
            </div>
            <h3 className="font-semibold mb-2">Fund USDC</h3>
            <p className="text-sm text-gray-600">
              Transfer USDC to your wallet to start trading.
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              3
            </div>
            <h3 className="font-semibold mb-2">Trade Outcomes</h3>
            <p className="text-sm text-gray-600">
              Choose a market, split USDC, and trade YES/NO positions.
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              4
            </div>
            <h3 className="font-semibold mb-2">Redeem</h3>
            <p className="text-sm text-gray-600">
              After settlement, redeem winning positions for payouts.
            </p>
          </div>
        </div>
        <div className="mt-8 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Markets with no activity for 7 days are terminated by admins to avoid user-triggered calls.
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-8 mt-16">
        <div className="text-center">
          <div className="text-4xl font-bold text-blue-600 mb-2">$0</div>
          <div className="text-gray-600">Total Volume</div>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-purple-600 mb-2">0</div>
          <div className="text-gray-600">Active Markets</div>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-green-600 mb-2">0</div>
          <div className="text-gray-600">Registered Users</div>
        </div>
      </div>
    </div>
  );
}

