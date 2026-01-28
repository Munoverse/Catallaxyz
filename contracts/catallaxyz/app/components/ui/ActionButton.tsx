'use client';

type ActionButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'purple' | 'teal' | 'indigo' | 'emerald';
  className?: string;
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Type attribute for the button */
  type?: 'button' | 'submit' | 'reset';
};

const variantClasses: Record<string, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
  secondary: 'bg-gray-900 hover:bg-black text-white focus:ring-gray-500',
  success: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500',
  danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
  purple: 'bg-purple-600 hover:bg-purple-700 text-white focus:ring-purple-500',
  teal: 'bg-teal-600 hover:bg-teal-700 text-white focus:ring-teal-500',
  indigo: 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500',
  emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500',
};

export default function ActionButton({
  onClick,
  disabled,
  loading,
  loadingText = 'Submitting...',
  children,
  variant = 'primary',
  className = '',
  ariaLabel,
  type = 'button',
}: ActionButtonProps) {
  const baseClasses = 'w-full px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2';
  const colorClasses = variantClasses[variant] || variantClasses.primary;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading}
      aria-disabled={disabled || loading}
      className={`${baseClasses} ${colorClasses} ${className}`}
    >
      {loading ? (
        <span className="flex items-center justify-center" role="status">
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span aria-live="polite">{loadingText}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
