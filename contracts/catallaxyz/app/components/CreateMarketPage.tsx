'use client';

import { useCallback, useState } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import type { Transaction } from '@solana/web3.js';
import { useRouter } from 'next/navigation';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useSigner } from '../hooks/useSigner';
import LoginPromptModal from './LoginPromptModal';
import {
  deriveGlobalPda,
  deriveMarketPda,
  deriveMarketVaultPda,
  derivePlatformTreasuryPda,
  getConnection,
  getProgram,
  getProgramId,
  SignerLike,
} from '../lib/solana';
import { setMarketQuestion } from '../lib/market-metadata';

const getEnvPublicKey = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return new PublicKey(value);
};

const deriveMarketId = async (title: string, creator: PublicKey) => {
  const encoder = new TextEncoder();
  const titleBytes = encoder.encode(title.trim());
  const creatorBytes = creator.toBytes();
  const data = new Uint8Array(creatorBytes.length + titleBytes.length);
  data.set(creatorBytes, 0);
  data.set(titleBytes, creatorBytes.length);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash).slice(0, 32);
};

interface FormData {
  title: string;
  description: string;
  yesDescription: string;
  noDescription: string;
}

export default function CreateMarketPage() {
  const router = useRouter();
  const { authenticated, loginWithMagic, magicError, resolveSigner } = useSigner();
  
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    yesDescription: 'YES',
    noDescription: 'NO',
  });
  
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Handle form input
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      setError('Please enter a market title.');
      return false;
    }
    setError(null);
    return true;
  };

  const resolveSignerWithTransactions = useCallback(
    async (): Promise<SignerLike | null> => {
      const signer = await resolveSigner();
      if (!signer) return null;
      return {
        ...signer,
        signAllTransactions:
          signer.signAllTransactions ??
          (async (txs: Transaction[]) =>
            Promise.all(txs.map((tx) => signer.signTransaction(tx)))),
      };
    },
    [resolveSigner]
  );

  // Create market
  const handleCreateMarket = async () => {
    // Check authentication
    if (!authenticated) {
      setShowLoginPrompt(true);
      return;
    }

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const signer = await resolveSignerWithTransactions();
      if (!signer) {
        throw new Error('No wallet or Magic session available.');
      }

      const programId = getProgramId();

      const connection = getConnection();
      const program = getProgram(connection, signer);

      const creator = signer.publicKey;
      const marketIdBytes = await deriveMarketId(formData.title, creator);
      
      const switchboardQueue = getEnvPublicKey('NEXT_PUBLIC_SWITCHBOARD_QUEUE');
      const randomnessAccount = getEnvPublicKey('NEXT_PUBLIC_RANDOMNESS_ACCOUNT');

      const globalPda = deriveGlobalPda(programId);
      const globalAccount = await program.account.global.fetch(globalPda);

      const marketPda = deriveMarketPda(programId, creator, marketIdBytes);

      const platformTreasury = derivePlatformTreasuryPda(programId);
      const marketUsdcVault = deriveMarketVaultPda(programId, marketPda);

      const creatorUsdcAccount = getAssociatedTokenAddressSync(
        globalAccount.usdcMint,
        creator,
        false,
        TOKEN_PROGRAM_ID
      );

      // Call program (align to IDL: question + marketId)
      const tx = await program.methods
        .createMarket({
          question: formData.title,
          description: formData.description.trim(),
          yesDescription: formData.yesDescription.trim() || 'YES',
          noDescription: formData.noDescription.trim() || 'NO',
          marketId: Array.from(marketIdBytes),
        })
        .accounts({
          creator,
          global: globalPda,
          market: marketPda,
          switchboardQueue,
          randomnessAccount,
          platformTreasury,
          creatorUsdcAccount,
          usdcMint: globalAccount.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const vaultTx = await program.methods
        .initMarketVault()
        .accounts({
          creator,
          global: globalPda,
          market: marketPda,
          marketUsdcVault,
          usdcMint: globalAccount.usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setMarketQuestion(marketPda.toString(), formData.title);

      try {
        await fetch('/api/markets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: marketPda.toString(),
            creator: creator.toString(),
            title: formData.title,
            question: formData.title,
          }),
        });
      } catch (err: unknown) {
        // AUDIT FIX v1.1.0: Use unknown type for catch blocks
        console.warn('Market DB sync failed:', err);
      }

      // Navigate to market detail page
      router.push(`/market/${marketPda.toString()}`);

    } catch (err: unknown) {
      // AUDIT FIX: Use unknown type with type guard
      console.error('Failed to create market:', err);
      const message = err instanceof Error ? err.message : 'Failed to create market. Please try again.';
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  if (showLoginPrompt) {
    return (
      <LoginPromptModal
        open={showLoginPrompt}
        onMagicLogin={() => loginWithMagic()}
        onClose={() => setShowLoginPrompt(false)}
        error={magicError}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create Prediction Market</h1>
        <p className="text-gray-600">
          Create a new prediction market for users to trade forecasts
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Basic info */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold border-b pb-2">Basic Info</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Market title *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Example: Will Bitcoin exceed $100,000 by the end of 2024?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={100}
            />
            <p className="text-sm text-gray-500 mt-1">{formData.title.length}/100</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Provide additional context or resolution details."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={500}
              rows={3}
            />
            <p className="text-sm text-gray-500 mt-1">{formData.description.length}/500</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                YES description
              </label>
              <input
                type="text"
                name="yesDescription"
                value={formData.yesDescription}
                onChange={handleChange}
                placeholder="YES"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={200}
              />
              <p className="text-sm text-gray-500 mt-1">{formData.yesDescription.length}/200</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NO description
              </label>
              <input
                type="text"
                name="noDescription"
                value={formData.noDescription}
                onChange={handleChange}
                placeholder="NO"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={200}
              />
              <p className="text-sm text-gray-500 mt-1">{formData.noDescription.length}/200</p>
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            YES/NO are on-chain position records; no SPL tokens are created.
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-gray-700">Preview</h3>
          <div className="text-sm text-gray-600">
            <p><strong>Title:</strong> {formData.title || '(Not set)'}</p>
            <p><strong>Description:</strong> {formData.description || '(Not set)'}</p>
            <p>
              <strong>Options:</strong> {formData.yesDescription || 'YES'} vs {formData.noDescription || 'NO'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <button
            onClick={() => router.back()}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition"
            disabled={isCreating}
          >
            Cancel
          </button>
          <button
            onClick={handleCreateMarket}
            disabled={isCreating}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center justify-center"
          >
            {isCreating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating...
              </>
            ) : (
              'Create market'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

