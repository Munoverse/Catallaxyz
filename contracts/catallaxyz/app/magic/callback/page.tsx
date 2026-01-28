'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMagicAuth } from '../../components/magic-auth';

export default function MagicCallbackPage() {
  const router = useRouter();
  const { completeMagicRedirect } = useMagicAuth();
  const [error, setError] = useState<string | null>(null);

  const retry = useCallback(async () => {
    setError(null);
    await completeMagicRedirect();
    router.replace('/');
  }, [completeMagicRedirect, router]);

  useEffect(() => {
    const finishLogin = async () => {
      try {
        await completeMagicRedirect();
        router.replace('/');
      } catch (err: unknown) {
        // AUDIT FIX: Use unknown type with type guard
        const message = err instanceof Error ? err.message : 'Magic login failed. Please try again.';
        setError(message);
      }
    };
    void finishLogin();
  }, [completeMagicRedirect, router]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold mb-2">
        {error ? 'Sign-in failed' : 'Signing you in...'}
      </h1>
      <p className="text-gray-600">
        {error ? error : 'Completing Magic login. Please wait.'}
      </p>
      {error && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => void retry()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-black transition"
          >
            Try again
          </button>
          <button
            onClick={() => router.replace('/')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold"
          >
            Back to home
          </button>
        </div>
      )}
    </div>
  );
}
