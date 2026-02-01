'use client';

import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { useState } from 'react';

export function WalletInfo() {
  const { publicKey, isConnected, walletAddress } = usePhantomWallet();
  const [copied, setCopied] = useState(false);
  
  const address = walletAddress;
  const walletType = 'Phantom';
  const isDevnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet';

  const copyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const viewOnExplorer = () => {
    if (address) {
      const explorerUrl = isDevnet
        ? `https://explorer.solana.com/address/${address}?cluster=devnet`
        : `https://explorer.solana.com/address/${address}`;
      window.open(explorerUrl, '_blank');
    }
  };

  if (!isConnected || !address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
          <CardDescription>
            Connect a wallet to view your wallet information
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Solana Wallet</CardTitle>
        <CardDescription>
          Connected: {walletType}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Wallet address */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Address</label>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted px-3 py-2 rounded flex-1 break-all">
              {address}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copyAddress}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Short address display */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-md">
          <div>
            <p className="text-sm font-medium">Short Address</p>
            <code className="text-xs text-muted-foreground">
              {address.slice(0, 8)}...{address.slice(-8)}
            </code>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={viewOnExplorer}
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Explorer
          </Button>
        </div>

        {/* Network info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Network:</span>
          <span className="font-medium">
            {isDevnet ? 'Solana Devnet' : 'Solana Mainnet'}
          </span>
        </div>

        {/* Wallet type details */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md">
          <p className="text-xs text-blue-800 dark:text-blue-300">
            💡 You're using <strong>{walletType}</strong> wallet. 
            Your keys are self-custodied and secured by your wallet provider.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
