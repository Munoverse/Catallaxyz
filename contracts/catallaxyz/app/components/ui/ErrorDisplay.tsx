'use client';

import React from 'react';

interface ErrorDisplayProps {
  /** Error message to display */
  message: string;
  /** Title for the error (optional) */
  title?: string;
  /** Callback for retry button (optional) */
  onRetry?: () => void;
  /** Callback for dismiss button (optional) */
  onDismiss?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Variant style */
  variant?: 'inline' | 'banner' | 'card';
}

/**
 * Error display component with various styles
 */
export default function ErrorDisplay({
  message,
  title = 'Error',
  onRetry,
  onDismiss,
  className = '',
  variant = 'banner',
}: ErrorDisplayProps) {
  const baseClasses = 'flex items-start gap-3 rounded-lg';
  
  const variantClasses = {
    inline: 'text-red-600 text-sm py-1',
    banner: 'bg-red-50 border border-red-200 text-red-800 p-4',
    card: 'bg-white border border-red-300 shadow-md text-red-800 p-6',
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {/* Error icon */}
      <svg
        className="w-5 h-5 flex-shrink-0 mt-0.5"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>

      <div className="flex-1">
        {variant !== 'inline' && (
          <h3 className="font-medium mb-1">{title}</h3>
        )}
        <p className={variant === 'inline' ? '' : 'text-sm'}>{message}</p>
        
        {(onRetry || onDismiss) && (
          <div className="mt-3 flex gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1.5 text-sm font-medium text-red-800 bg-red-100 hover:bg-red-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Try again
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
