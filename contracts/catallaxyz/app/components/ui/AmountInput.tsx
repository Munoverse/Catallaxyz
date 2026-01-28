'use client';

import { useId } from 'react';

type AmountInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  disabled?: boolean;
  className?: string;
  /** Optional hint text displayed below the input */
  hint?: string;
  /** Required field indicator */
  required?: boolean;
  /** Unit label (e.g., "USDC") */
  unit?: string;
};

export default function AmountInput({
  label,
  value,
  onChange,
  placeholder = '0.00',
  error,
  disabled,
  className = '',
  hint,
  required = false,
  unit,
}: AmountInputProps) {
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();

  const describedBy = [
    error ? errorId : null,
    hint ? hintId : null,
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`space-y-2 ${className}`}>
      <label 
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
        {required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
      </label>
      
      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          className={`w-full px-3 py-2 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-0 ${
            error 
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
          } ${unit ? 'pr-16' : ''}`}
        />
        {unit && (
          <span 
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500"
            aria-hidden="true"
          >
            {unit}
          </span>
        )}
      </div>
      
      {hint && !error && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
      
      {error && (
        <p id={errorId} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
