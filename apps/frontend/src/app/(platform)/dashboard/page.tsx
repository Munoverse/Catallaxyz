'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { useWalletUser } from '@/hooks/useWalletUser';
import { Loader2 } from 'lucide-react';

/**
 * Dashboard Redirect Page
 * 
 * This page has been consolidated into the user profile page.
 * Redirects to /@username for a unified profile experience.
 */
export default function DashboardRedirect() {
  const router = useRouter();
  const { publicKey } = usePhantomWallet();
  const { user, isLoading } = useWalletUser();

  useEffect(() => {
    if (!isLoading) {
      if (user?.username) {
        // Redirect to user's profile page
        router.replace(`/@${user.username}`);
      } else if (publicKey) {
        // User has wallet but no username yet - redirect to settings
        router.replace('/settings');
      } else {
        // No wallet connected - redirect to home
        router.replace('/');
      }
    }
  }, [user, publicKey, isLoading, router]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center">
      <Loader2 className="size-8 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground">Redirecting to your profile...</p>
      <p className="text-xs text-muted-foreground mt-2">
        The dashboard has been integrated into your profile page
      </p>
    </div>
  );
}

