/**
 * Jupiter DEX Aggregator Integration for catallaxyz
 * 
 * This module provides functions to interact with Jupiter for token swaps on Solana
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js'

// Jupiter API endpoint
const JUPITER_API_URL = process.env.NEXT_PUBLIC_JUPITER_API || 'https://quote-api.jup.ag/v6'

interface JupiterQuoteParams {
  inputMint: string
  outputMint: string
  amount: number
  slippageBps?: number
}

interface JupiterQuote {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  priceImpactPct: string
  routePlan: any[]
}

interface JupiterSwapParams {
  quoteResponse: JupiterQuote
  userPublicKey: string
  wrapUnwrapSOL?: boolean
  prioritizationFeeLamports?: number
}

/**
 * Get a quote for a token swap from Jupiter
 */
export async function getJupiterQuote(
  params: JupiterQuoteParams
): Promise<JupiterQuote> {
  const { inputMint, outputMint, amount, slippageBps = 50 } = params

  const queryParams = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: slippageBps.toString(),
  })

  const response = await fetch(`${JUPITER_API_URL}/quote?${queryParams}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Jupiter quote failed: ${error.message || response.statusText}`)
  }

  return response.json()
}

/**
 * Get the swap transaction from Jupiter
 */
export async function getJupiterSwapTransaction(
  params: JupiterSwapParams
): Promise<string> {
  const { quoteResponse, userPublicKey, wrapUnwrapSOL = true, prioritizationFeeLamports } = params

  const response = await fetch(`${JUPITER_API_URL}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapUnwrapSOL,
      prioritizationFeeLamports,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Jupiter swap transaction failed: ${error.message || response.statusText}`)
  }

  const { swapTransaction } = await response.json()
  return swapTransaction
}

/**
 * Execute a token swap using Jupiter
 * 
 * @param connection - Solana connection
 * @param wallet - User wallet with signTransaction method
 * @param inputMint - Input token mint address
 * @param outputMint - Output token mint address (usually USDC)
 * @param amount - Amount in base units (lamports for SOL, smallest unit for tokens)
 * @param slippageBps - Slippage tolerance in basis points (default: 50 = 0.5%)
 * @returns Transaction signature
 */
export async function swapTokens(
  connection: Connection,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps = 50
): Promise<string> {
  try {
    // 1. Get quote
    console.log('Getting Jupiter quote...')
    const quote = await getJupiterQuote({
      inputMint,
      outputMint,
      amount,
      slippageBps,
    })

    console.log('Quote received:', {
      inputAmount: quote.inAmount,
      outputAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
    })

    // 2. Get swap transaction
    console.log('Getting swap transaction...')
    const swapTransactionBase64 = await getJupiterSwapTransaction({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
    })

    // 3. Deserialize transaction
    const swapTransactionBuf = Buffer.from(swapTransactionBase64, 'base64')
    const transaction = Transaction.from(swapTransactionBuf)

    // 4. Sign transaction
    console.log('Signing transaction...')
    const signedTransaction = await wallet.signTransaction(transaction)

    // 5. Send transaction
    console.log('Sending transaction...')
    const rawTransaction = signedTransaction.serialize()
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 2,
    })

    // 6. Confirm transaction
    console.log('Confirming transaction...')
    await connection.confirmTransaction(txid, 'confirmed')

    console.log('Swap successful! Transaction:', txid)
    return txid
  } catch (error) {
    console.error('Swap error:', error)
    throw error
  }
}

/**
 * Get the estimated output amount for a swap
 * Useful for displaying estimates before executing
 */
export async function getSwapEstimate(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps = 50
): Promise<{
  inputAmount: string
  outputAmount: string
  priceImpact: string
  minOutputAmount: string
}> {
  const quote = await getJupiterQuote({
    inputMint,
    outputMint,
    amount,
    slippageBps,
  })

  return {
    inputAmount: quote.inAmount,
    outputAmount: quote.outAmount,
    priceImpact: quote.priceImpactPct,
    minOutputAmount: quote.otherAmountThreshold,
  }
}

/**
 * Common token mints on Solana Mainnet
 */
export const SOLANA_TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
}

/**
 * Convert human-readable amount to token base units
 * 
 * @param amount - Human-readable amount (e.g., 1.5)
 * @param decimals - Token decimals (e.g., 9 for SOL, 6 for USDC)
 */
export function toBaseUnits(amount: number, decimals: number): number {
  return Math.floor(amount * Math.pow(10, decimals))
}

/**
 * Convert token base units to human-readable amount
 * 
 * @param amount - Amount in base units
 * @param decimals - Token decimals
 */
export function fromBaseUnits(amount: number, decimals: number): number {
  return amount / Math.pow(10, decimals)
}

