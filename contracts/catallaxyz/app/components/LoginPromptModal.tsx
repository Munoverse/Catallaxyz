'use client';

import { UnifiedWalletButton } from '@jup-ag/wallet-adapter';

type LoginPromptModalProps = {
  open: boolean;
  onMagicLogin: () => void;
  onClose: () => void;
  error?: string | null;
};

export default function LoginPromptModal({
  open,
  onMagicLogin,
  onClose,
  error,
}: LoginPromptModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl animate-slide-in">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-center mb-3">Sign in to create a market</h2>
        <p className="text-gray-600 text-center mb-6">
          Choose a login method. Web2 users can sign in with Magic, or connect a Solana wallet directly.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
          <div className="flex items-center text-sm text-gray-700">
            <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Magic creates a wallet for web2 users</span>
          </div>
          <div className="flex items-center text-sm text-gray-700">
            <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Social login with Google</span>
          </div>
          <div className="flex items-center text-sm text-gray-700">
            <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Connect existing Solana wallets too</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={onMagicLogin}
            className="w-full bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-black transition shadow-md hover:shadow-lg"
          >
            Continue with Google
          </button>
          <UnifiedWalletButton className="w-full justify-center" />
          <button
            onClick={onClose}
            className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          {error && (
            <div className="text-sm text-red-600 text-center">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
