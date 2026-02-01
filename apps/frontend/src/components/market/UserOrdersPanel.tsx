'use client';

import React from 'react';
import { useClobOrderbook } from '@/hooks/useClobOrderbook';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';

interface UserOrdersPanelProps {
  marketId: string;
}

function OrderRow({ order, onCancel }: { order: any; onCancel: (orderId: string) => void }) {
  const [cancelling, setCancelling] = React.useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await onCancel(order.orderId);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-muted/50 rounded-lg transition-colors">
      <div className="flex items-center gap-3 flex-1">
        {/* Side Badge */}
        <Badge 
          variant={order.side === 'buy' ? 'default' : 'destructive'}
          className={order.side === 'buy' ? 'bg-green-600' : 'bg-red-600'}
        >
          {order.side.toUpperCase()}
        </Badge>

        {/* Price */}
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            ${(Number(order.price || 0) * 100).toFixed(1)}¢
          </span>
          <span className="text-xs text-muted-foreground">Price</span>
        </div>

        {/* Size */}
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {Number(order.amount || 0).toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">Size</span>
        </div>

        {/* Filled */}
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {Number(order.filled_amount || 0).toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">Filled</span>
        </div>

        {/* Status */}
        <Badge variant={order.status === 'open' ? 'outline' : 'secondary'}>
          {order.status}
        </Badge>
      </div>

      {/* Cancel Button */}
      {order.status === 'open' && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCancel}
          disabled={cancelling}
          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          {cancelling ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

export default function UserOrdersPanel({ marketId }: UserOrdersPanelProps) {
  const { orders, loading, cancelOrder, refreshOrders } = useClobOrderbook(marketId, 'yes');
  const { toast } = useToast();

  const handleCancelOrder = async (orderId: string) => {
    try {
      await cancelOrder(orderId);
      await refreshOrders();
      toast({
        title: '✓ Order cancelled',
        description: 'Your order has been successfully cancelled',
      });
    } catch (error: any) {
      toast({
        title: 'Failed to cancel order',
        description: error.message || 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  const openOrders = orders.filter((o) => o.status === 'open');
  const hasOpenOrders = openOrders.length > 0;

  if (loading && orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <LoadingSpinner text="Loading orders..." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">Your Orders</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No orders yet</p>
            <p className="text-xs mt-1">Place an order to get started</p>
          </div>
        ) : (
          <div className="space-y-1">
            {orders.map((order) => (
              <OrderRow
                key={order.orderId}
                order={order}
                onCancel={handleCancelOrder}
              />
            ))}
          </div>
        )}

        {/* Summary */}
        {hasOpenOrders && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Open Orders</span>
              <span className="font-semibold">{openOrders.length}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
