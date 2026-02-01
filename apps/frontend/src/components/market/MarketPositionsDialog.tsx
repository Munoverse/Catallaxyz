'use client';

import { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SplitPositionSingle from '@/components/SplitPositionSingle';
import MergePositionSingle from '@/components/MergePositionSingle';

interface MarketPositionsDialogProps {
  marketPda: string;
  yesSymbol?: string;
  noSymbol?: string;
  onSuccess?: () => void;
}

export default function MarketPositionsDialog({
  marketPda,
  yesSymbol = 'YES',
  noSymbol = 'NO',
  onSuccess,
}: MarketPositionsDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    onSuccess?.();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Position Management</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Position Management</DialogTitle>
          <DialogDescription>
            Split USDC into {yesSymbol}/{noSymbol} positions, or merge them back to USDC.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="split" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="split">Split</TabsTrigger>
            <TabsTrigger value="merge">Merge</TabsTrigger>
          </TabsList>

          <TabsContent value="split" className="mt-4">
            <SplitPositionSingle
              marketPda={marketPda}
              yesSymbol={yesSymbol}
              noSymbol={noSymbol}
              onSuccess={handleSuccess}
            />
          </TabsContent>

          <TabsContent value="merge" className="mt-4">
            <MergePositionSingle
              marketPda={marketPda}
              yesSymbol={yesSymbol}
              noSymbol={noSymbol}
              onSuccess={handleSuccess}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
