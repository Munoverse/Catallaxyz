'use client'

import { useState } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { getConnection } from '@/lib/solana-connection'
import { PublicKey, Transaction } from '@solana/web3.js'
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Coins, Wallet } from 'lucide-react'

export default function AdminMintUSDC() {
  const connection = getConnection()
  const { publicKey, solana } = usePhantomWallet()
  
  const [recipientAddress, setRecipientAddress] = useState('')
  const [mintAmount, setMintAmount] = useState('')
  const [isMinting, setIsMinting] = useState(false)

  // Get tUSDC mint from environment
  const testUsdcMint =
    process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS ||
    'DmPAkkBZ5hSv7GmioeNSa59jpTybHYRz5nt3NgwdQc4G'

  const handleMintUSDC = async () => {
    if (!publicKey || !solana) {
      toast.error('Please log in')
      return
    }

    if (!recipientAddress) {
      toast.error('Please enter a recipient address')
      return
    }

    const amount = parseFloat(mintAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    setIsMinting(true)

    try {
      const recipientPubkey = new PublicKey(recipientAddress)
      const mintPubkey = new PublicKey(testUsdcMint)

      // Get recipient's associated token account address
      const recipientTokenAccount = await getAssociatedTokenAddress(
        mintPubkey,
        recipientPubkey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )

      console.log('Recipient token account:', recipientTokenAccount.toString())

      // Check if token account exists
      const accountInfo = await connection.getAccountInfo(recipientTokenAccount)
      
      // Build transaction
      const transaction = new Transaction()
      
      // Create token account if it doesn't exist
      if (!accountInfo) {
        console.log('Creating associated token account...')
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey, // payer
            recipientTokenAccount,
            recipientPubkey, // owner
            mintPubkey,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        )
      }

      // Mint tokens (amount in smallest units, 6 decimals for USDC)
      const mintAmountLamports = Math.floor(amount * 10 ** 6)

      // Add mint instruction
      transaction.add(
        createMintToInstruction(
          mintPubkey,
          recipientTokenAccount,
          publicKey, // mint authority
          mintAmountLamports,
          [],
          TOKEN_PROGRAM_ID
        )
      )

      // Set transaction blockhash and fee payer
      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey
      
      // Send transaction using Phantom SDK
      const result = await solana.signAndSendTransaction(transaction)
      const signature = result.signature
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed')

      toast.success('tUSDC minted successfully!', {
        description: `${amount} tUSDC sent to ${recipientAddress.slice(0, 8)}...`,
        action: {
          label: 'View',
          onClick: () => window.open(`https://explorer.solana.com/tx/${signature}?cluster=devnet`, '_blank'),
        },
      })

      console.log('Mint tx:', signature)
      
      // Clear inputs
      setMintAmount('')
      // Keep recipient address for convenience
    } catch (error: any) {
      console.error('Error minting tUSDC:', error)
      
      let errorMessage = 'Failed to mint tUSDC'
      if (error.message?.includes('0x5')) {
        errorMessage = 'You are not the mint authority for this token'
      } else if (error.message?.includes('invalid')) {
        errorMessage = 'Invalid recipient address'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast.error(errorMessage, {
        description: 'Make sure you have mint authority and sufficient SOL for fees',
      })
    } finally {
      setIsMinting(false)
    }
  }

  const handleSetSelfAsRecipient = () => {
    if (publicKey) {
      setRecipientAddress(publicKey.toBase58())
    }
  }

  const isDevnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet'

  return (
    <div className="space-y-6">
      {/* Warning for Production */}
      {!isDevnet && (
        <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 p-4">
          <div className="flex items-start gap-3">
            <div className="text-sm text-red-800 dark:text-red-200">
              <p className="font-medium mb-1">⚠️ Warning: Production Environment</p>
              <p>Minting is only available on Devnet. On Mainnet, USDC is controlled by Circle.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Test USDC Mint Info */}
      <Card className="bg-muted/50 p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Test USDC Mint:</span>
            <code className="text-xs bg-background px-2 py-1 rounded">
              {testUsdcMint.slice(0, 8)}...{testUsdcMint.slice(-8)}
            </code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Network:</span>
            <span className="text-xs font-medium">
              {isDevnet ? 'Devnet' : 'Mainnet'}
            </span>
          </div>
        </div>
      </Card>

      {/* Recipient Address */}
      <div className="space-y-2">
        <Label htmlFor="recipient-address">Recipient Wallet Address</Label>
        <div className="flex gap-2">
          <Input
            id="recipient-address"
            placeholder="Enter recipient address..."
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={handleSetSelfAsRecipient}
            disabled={!publicKey}
            title="Use my address"
          >
            <Wallet className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The wallet that will receive the test USDC
        </p>
      </div>

      {/* Mint Amount */}
      <div className="space-y-2">
        <Label htmlFor="mint-amount">Amount (tUSDC)</Label>
        <Input
          id="mint-amount"
          type="number"
          placeholder="0.00"
          value={mintAmount}
          onChange={(e) => setMintAmount(e.target.value)}
          step="0.01"
          min="0"
        />
        <p className="text-xs text-muted-foreground">
          Amount of test USDC to mint
        </p>
      </div>

      {/* Quick Amount Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMintAmount('100')}
        >
          100
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMintAmount('1000')}
        >
          1,000
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMintAmount('5000')}
        >
          5,000
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMintAmount('10000')}
        >
          10,000
        </Button>
      </div>

      {/* Mint Button */}
      <Button
        onClick={handleMintUSDC}
        disabled={isMinting || !recipientAddress || !mintAmount || !isDevnet}
        className="w-full"
        size="lg"
      >
        {isMinting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Minting tUSDC...
          </>
        ) : (
          <>
            <Coins className="mr-2 h-4 w-4" />
            Mint Test USDC
          </>
        )}
      </Button>

      {/* Info Card */}
      <Card className="bg-blue-50 dark:bg-blue-950/30 p-4">
        <div className="text-sm space-y-2">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            📝 Requirements:
          </p>
          <ul className="space-y-1 text-blue-800 dark:text-blue-200 list-disc list-inside text-xs">
            <li>You must be the mint authority of the test USDC token</li>
            <li>Sufficient SOL for transaction fees (~0.001 SOL)</li>
            <li>Recipient will automatically get a token account created if needed</li>
            <li>Only works on Devnet (test environment)</li>
          </ul>
        </div>
      </Card>

      {/* Alternative: Terminal Command */}
      <Card className="bg-muted/50 p-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Alternative: Use Terminal Command</p>
          <code className="text-xs bg-background px-3 py-2 rounded block overflow-x-auto">
            yarn ts-node scripts/mint-tusdc-to-user.ts [address] [amount]
          </code>
          <p className="text-xs text-muted-foreground">
            From the <code>/catallaxyz</code> directory
          </p>
        </div>
      </Card>
    </div>
  )
}
