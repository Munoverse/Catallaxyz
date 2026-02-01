'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { 
  Play, 
  Pause, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import { buildWalletAuthHeaders } from '@/lib/wallet-auth';

interface MarketStatus {
  id: string;
  status: 'active' | 'paused' | 'running' | 'settled' | 'closed' | 'cancelled';
  isPaused: boolean;
  pausedAt?: string;
  pausedReason?: string;
  createdAt: string;
  updatedAt: string;
  settledAt?: string;
  expiresAt?: string;
}

interface MarketManagementPanelProps {
  marketId: string;
  creatorId: string;
  currentUserId?: string;
  className?: string;
  onStatusUpdate?: (status: MarketStatus) => void;
}

const statusConfig = {
  active: {
    label: 'Active',
    icon: CheckCircle,
    color: 'text-yes',
    bgColor: 'bg-yes/10',
    description: 'Market is active and accepting trades',
  },
  running: {
    label: 'Running',
    icon: Play,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    description: 'Market is actively running',
  },
  paused: {
    label: 'Paused',
    icon: Pause,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    description: 'Market is temporarily paused',
  },
  settled: {
    label: 'Settled',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-600/10',
    description: 'Market has been settled',
  },
  closed: {
    label: 'Closed',
    icon: XCircle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
    description: 'Market is closed',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    color: 'text-no',
    bgColor: 'bg-no/10',
    description: 'Market has been cancelled',
  },
};

export default function MarketManagementPanel({
  marketId,
  creatorId,
  currentUserId,
  className,
  onStatusUpdate,
}: MarketManagementPanelProps) {
  const { t } = useTranslation();
  const { walletAddress, solana } = usePhantomWallet();
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [pausedReason, setPausedReason] = useState('');
  const [updating, setUpdating] = useState(false);

  const isCreator = currentUserId === creatorId;

  const buildAuthHeaders = async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (!walletAddress || !solana) {
      throw new Error('Wallet not connected or missing signature support');
    }
    const signMessage = async (message: Uint8Array) => {
      const { signature } = await solana.signMessage(message);
      return signature;
    };
    const authHeaders = await buildWalletAuthHeaders({
      walletAddress,
      signMessage,
    });
    Object.assign(headers, authHeaders);
    return headers;
  };

  // Fetch current market status
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/markets/${marketId}/status`);
      const result = await response.json();

      if (result.success) {
        setMarketStatus(result.data);
      } else {
        toast.error('Failed to fetch market status');
      }
    } catch (error) {
      console.error('Error fetching market status:', error);
      toast.error('Failed to fetch market status');
    } finally {
      setLoading(false);
    }
  };

  // Update market status
  const updateStatus = async () => {
    if (!newStatus || !isCreator) return;

    try {
      setUpdating(true);
      const headers = await buildAuthHeaders();
      const response = await apiFetch(`/api/markets/${marketId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: newStatus,
          pausedReason: newStatus === 'paused' ? pausedReason : undefined,
          creatorId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMarketStatus(result.data);
        toast.success('Market status updated successfully');
        setShowDialog(false);
        setPausedReason('');
        onStatusUpdate?.(result.data);
      } else {
        toast.error(result.error?.message || 'Failed to update market status');
      }
    } catch (error) {
      console.error('Error updating market status:', error);
      toast.error('Failed to update market status');
    } finally {
      setUpdating(false);
    }
  };

  // Toggle pause
  const togglePause = async () => {
    if (!isCreator || !marketStatus) return;

    const isPaused = !marketStatus.isPaused;

    try {
      setUpdating(true);
      const headers = await buildAuthHeaders();
      const response = await apiFetch(`/api/markets/${marketId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          isPaused,
          pausedReason: isPaused ? pausedReason : undefined,
          creatorId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMarketStatus(result.data);
        toast.success(isPaused ? 'Market paused' : 'Market resumed');
        onStatusUpdate?.(result.data);
      } else {
        toast.error(result.error?.message || 'Failed to toggle pause');
      }
    } catch (error) {
      console.error('Error toggling pause:', error);
      toast.error('Failed to toggle pause');
    } finally {
      setUpdating(false);
    }
  };

  // Load status on mount
  useEffect(() => {
    fetchStatus();
  }, [marketId]);

  if (loading || !marketStatus) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Market Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Clock className="animate-spin h-6 w-6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const config = statusConfig[marketStatus.status];
  const StatusIcon = config.icon;

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <CardTitle>Market Management</CardTitle>
          <CardDescription>
            {isCreator ? 'Manage your market status and settings' : 'View market status information'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Status */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Current Status</Label>
            <div className={cn('flex items-center gap-3 p-4 rounded-lg', config.bgColor)}>
              <StatusIcon className={cn('h-6 w-6', config.color)} />
              <div className="flex-1">
                <div className="font-medium">{config.label}</div>
                <div className="text-sm text-muted-foreground">{config.description}</div>
              </div>
            </div>
          </div>

          {/* Paused Info */}
          {marketStatus.isPaused && marketStatus.pausedReason && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <div className="font-medium text-yellow-700 dark:text-yellow-500">Market Paused</div>
                <div className="text-sm text-muted-foreground mt-1">{marketStatus.pausedReason}</div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Created:</span>
              <span className="font-medium">{new Date(marketStatus.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Last Updated:</span>
              <span className="font-medium">{new Date(marketStatus.updatedAt).toLocaleString()}</span>
            </div>
            {marketStatus.settledAt && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Settled:</span>
                <span className="font-medium">{new Date(marketStatus.settledAt).toLocaleString()}</span>
              </div>
            )}
            {marketStatus.expiresAt && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expires:</span>
                <span className="font-medium">{new Date(marketStatus.expiresAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Actions (Only for Creator) */}
          {isCreator && marketStatus.status !== 'settled' && marketStatus.status !== 'cancelled' && (
            <div className="space-y-3 pt-4 border-t">
              <Label className="text-sm font-medium">Actions</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePause}
                  disabled={updating}
                  className="flex-1"
                >
                  {marketStatus.isPaused ? (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDialog(true)}
                  disabled={updating}
                  className="flex-1"
                >
                  Change Status
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Change Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Market Status</DialogTitle>
            <DialogDescription>
              Update the market status. This action may affect trading and user interactions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="status">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="settled">Settled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newStatus === 'paused' && (
              <div className="space-y-2">
                <Label htmlFor="reason">Pause Reason (Optional)</Label>
                <Textarea
                  id="reason"
                  value={pausedReason}
                  onChange={(e) => setPausedReason(e.target.value)}
                  placeholder="Explain why the market is being paused..."
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={updating}>
              Cancel
            </Button>
            <Button onClick={updateStatus} disabled={!newStatus || updating}>
              {updating ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

