'use client';

import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  isConnected: boolean;
  className?: string;
  showLabel?: boolean;
}

export default function ConnectionStatus({ 
  isConnected, 
  className,
  showLabel = true 
}: ConnectionStatusProps) {
  return (
    <Badge 
      variant={isConnected ? 'default' : 'destructive'}
      className={cn(
        'flex items-center gap-1.5',
        isConnected 
          ? 'bg-green-600 hover:bg-green-700' 
          : 'bg-red-600 hover:bg-red-700',
        className
      )}
    >
      {isConnected ? (
        <Wifi className="h-3 w-3" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      {showLabel && (
        <span className="text-xs">
          {isConnected ? 'Live' : 'Connecting...'}
        </span>
      )}
    </Badge>
  );
}
