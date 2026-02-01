export const TIP_TOKEN_MINT = process.env.NEXT_PUBLIC_TIP_TOKEN_MINT || ''
export const TIP_TOKEN_DECIMALS = Number.parseInt(
  process.env.NEXT_PUBLIC_TIP_TOKEN_DECIMALS || '6',
  10,
)
export const TIP_TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TIP_TOKEN_SYMBOL || 'Twish'

export function formatTipUiAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
  }).format(amount)
}

export function toTipUiAmount(amount: string | number | bigint | null | undefined): number {
  if (amount === null || amount === undefined) {
    return 0
  }

  if (typeof amount === 'number') {
    return amount / Math.pow(10, TIP_TOKEN_DECIMALS)
  }

  const raw = typeof amount === 'bigint' ? amount : BigInt(amount)
  return Number(raw) / Math.pow(10, TIP_TOKEN_DECIMALS)
}

export function formatTipAmount(amount: string | number | bigint | null | undefined): string {
  const uiAmount = toTipUiAmount(amount)
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
  }).format(uiAmount)
}
