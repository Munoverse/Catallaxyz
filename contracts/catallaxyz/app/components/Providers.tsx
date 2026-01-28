'use client';

import { UnifiedWalletProvider } from '@jup-ag/wallet-adapter';
import { MagicAuthProvider } from './magic-auth';
import { NotificationProvider } from './notifications';
import { ErrorBoundary } from './ErrorBoundary';

type ProvidersProps = {
  children: React.ReactNode;
};

const getWalletEnv = (rpcUrl: string) => {
  if (rpcUrl.includes('mainnet')) {
    return 'mainnet-beta';
  }
  if (rpcUrl.includes('testnet')) {
    return 'testnet';
  }
  return 'devnet';
};

export default function Providers({ children }: ProvidersProps) {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const env = process.env.NEXT_PUBLIC_SOLANA_ENV || getWalletEnv(rpcUrl);

  return (
    <ErrorBoundary>
      <UnifiedWalletProvider
        wallets={[]}
        config={{
          autoConnect: true,
          env,
          metadata: {
            name: 'catallaxyz',
            description: 'Prediction markets on Solana',
            url: 'https://catallaxyz.app',
            iconUrls: ['https://catallaxyz.app/favicon.ico'],
          },
        }}
      >
        <NotificationProvider>
          <MagicAuthProvider>{children}</MagicAuthProvider>
        </NotificationProvider>
      </UnifiedWalletProvider>
    </ErrorBoundary>
  );
}
