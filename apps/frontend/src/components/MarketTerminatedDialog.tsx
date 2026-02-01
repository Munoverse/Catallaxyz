'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, Zap, CheckCircle2 } from 'lucide-react';

interface MarketTerminatedDialogProps {
  isOpen: boolean;
  onClose: () => void;
  marketTitle: string;
  finalYesPrice: number;
  finalNoPrice: number;
  winningOutcome: 'yes' | 'no';
  isTerminator?: boolean; // Whether this user triggered termination
  yesSymbol?: string;
  noSymbol?: string;
}

export default function MarketTerminatedDialog({
  isOpen,
  onClose,
  marketTitle,
  finalYesPrice,
  finalNoPrice,
  winningOutcome,
  isTerminator = false,
  yesSymbol = 'YES',
  noSymbol = 'NO',
}: MarketTerminatedDialogProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isOpen && isTerminator) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isTerminator]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            {isTerminator ? (
              <div className="relative">
                <div className="absolute inset-0 animate-ping">
                  <div className="h-20 w-20 rounded-full bg-yellow-400/20" />
                </div>
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-500">
                  <Trophy className="h-10 w-10 text-white" />
                </div>
              </div>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
                <Zap className="h-10 w-10 text-white" />
              </div>
            )}
          </div>
          
          <DialogTitle className="text-center text-2xl">
            {isTerminator ? (
              <span className="bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                🎉 Congratulations! You triggered the termination!
              </span>
            ) : (
              'Market terminated'
            )}
          </DialogTitle>
          
          <DialogDescription className="text-center space-y-2">
            {isTerminator && (
              <p className="text-base font-medium text-foreground">
                Your trade triggered the random termination mechanism.
              </p>
            )}
            <p className="text-sm">
              Market "<span className="font-semibold">{marketTitle}</span>" has terminated.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Termination info */}
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Termination status</span>
              <Badge variant="secondary" className="bg-purple-600 text-white">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Terminated
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{yesSymbol} final price</div>
                <div className="text-lg font-bold text-green-600">
                  ${finalYesPrice.toFixed(3)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{noSymbol} final price</div>
                <div className="text-lg font-bold text-red-600">
                  ${finalNoPrice.toFixed(3)}
                </div>
              </div>
            </div>

            {winningOutcome && (
              <div className="pt-2 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-1">Price-leading outcome</div>
                <Badge 
                  variant="outline" 
                  className={
                    winningOutcome === 'yes' 
                      ? 'border-green-600 text-green-600 bg-green-50 dark:bg-green-950/20'
                      : 'border-red-600 text-red-600 bg-red-50 dark:bg-red-950/20'
                  }
                >
                  {winningOutcome === 'yes' ? yesSymbol : noSymbol}
                </Badge>
              </div>
            )}
          </div>

          {/* Catallaxyz reward notice */}
          {isTerminator && (
            <div className="rounded-lg bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 p-4 border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start gap-3">
                <Trophy className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                    Terminator badge
                  </p>
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    Your trade terminated the market. This moment is recorded on-chain.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Next steps */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-900 dark:text-blue-100">
              <span className="font-semibold">💡 Next steps:</span>
              <br />
              • If you hold the winning position, redeem to claim rewards
              <br />
              • Review your trade history and stats
              <br />
              • Explore other active markets to keep trading
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full" size="lg">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
