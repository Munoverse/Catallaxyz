'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { getConnection } from '@/lib/solana-connection';
import { useTranslation } from 'react-i18next';
import { calculateMarketCreationCosts, createCompleteMarket, storeMarketInSupabase } from '@/lib/market-creation';
import { apiFetch } from '@/lib/api-client';
import { InfoIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import toast from 'react-hot-toast';
import { address } from '@solana/addresses';
import { PublicKey } from '@solana/web3.js';
import { usecatallaxyzProgram } from '@/hooks/useCatallaxyzProgram';

interface Category {
  id: string;
  slug: string;
  name: string;
  name_zh: string | null;
  icon: string | null;
  is_active: boolean;
}

type FrequencyOption = 'all' | 'daily' | 'weekly' | 'monthly';

const FREQUENCY_OPTIONS: { value: FrequencyOption; labelKey: string }[] = [
  { value: 'all', labelKey: 'All' },
  { value: 'daily', labelKey: 'Daily' },
  { value: 'weekly', labelKey: 'Weekly' },
  { value: 'monthly', labelKey: 'Monthly' },
];

export default function CreateMarketPage() {
  const wallet = usePhantomWallet();
  const { isConnected: connected, publicKey, walletAddress, solana } = wallet;
  const connection = getConnection();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith('zh');
  const program = usecatallaxyzProgram();
  const [loading, setLoading] = useState(false);
  const [creatingOnChain, setCreatingOnChain] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    frequency: 'all' as FrequencyOption,
    yesOptionLabel: 'Yes',
    noOptionLabel: 'No',
    yesOptionSymbol: 'YES',
    noOptionSymbol: 'NO',
  });
  const [creationCosts, setCreationCosts] = useState<any>(null);
  const [showCosts, setShowCosts] = useState(false);

  // Load creation costs and categories
  useEffect(() => {
    calculateMarketCreationCosts().then(setCreationCosts);
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await apiFetch('/api/categories');
      const data = await response.json();
      if (data.success) {
        setCategories(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">{t('market.create.loginRequired', { defaultValue: 'Please log in to create a market' })}</p>
            <Button onClick={() => router.push('/')}>
              {t('common.goHome', { defaultValue: 'Go Home' })}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.title.trim()) {
      toast.error(t('market.create.titleRequired', { defaultValue: 'Title is required' }));
      return;
    }
    if (!formData.description.trim()) {
      toast.error(t('market.create.descriptionRequired', { defaultValue: 'Description is required' }));
      return;
    }
    if (!formData.yesOptionLabel.trim() || !formData.noOptionLabel.trim()) {
      toast.error(t('market.create.outcomeLabelRequired', { defaultValue: 'Outcome labels are required' }));
      return;
    }
    if (!formData.yesOptionSymbol.trim() || !formData.noOptionSymbol.trim()) {
      toast.error(t('market.create.outcomeSymbolRequired', { defaultValue: 'Outcome symbols are required' }));
      return;
    }

    setLoading(true);

    try {
      if (!walletAddress) {
        throw new Error('Wallet address is required to create a market');
      }

      if (!program) {
        throw new Error('Program not initialized');
      }

      // Step 1: Create market on-chain
      setCreatingOnChain(true);
      toast(t('market.create.creatingOnChain', { defaultValue: 'Creating market on Solana blockchain...' }), {
        icon: 'ℹ️',
      });

      if (!solana?.signTransaction || !wallet.publicKey) {
        throw new Error('Wallet does not support transaction signing');
      }

      const usdcMint = new PublicKey(
        process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS || '11111111111111111111111111111111'
      );

      const creatorAddress = address(walletAddress);
      const {
        marketPda,
        marketUsdcVault,
        randomnessAccount,
        switchboardQueue,
      } = await createCompleteMarket(
        {
          creator: creatorAddress,
          title: formData.title,
          description: formData.description,
          question: formData.title,
          category: formData.category || undefined,
          frequency: formData.frequency,
          yesOptionLabel: formData.yesOptionLabel,
          noOptionLabel: formData.noOptionLabel,
          yesOptionSymbol: formData.yesOptionSymbol,
          noOptionSymbol: formData.noOptionSymbol,
        },
        connection,
        wallet as any,
        program,
        usdcMint
      );

      setCreatingOnChain(false);
      toast.success(t('market.create.onChainSuccess', { defaultValue: 'Market created on-chain' }));

      // Step 2: Create market in database (binary market only)
      const marketPdaAddress = address(marketPda.toBase58());
      const randomnessAddress = address(randomnessAccount.toBase58());
      const switchboardQueueAddress = address(switchboardQueue.toBase58());
      const marketUsdcVaultAddress = address(marketUsdcVault.toBase58());
      const marketId = await storeMarketInSupabase(
        marketPdaAddress,
        {
          creator: creatorAddress,
          title: formData.title,
          description: formData.description,
          question: formData.title,
          category: formData.category || undefined,
          frequency: formData.frequency,
          yesOptionLabel: formData.yesOptionLabel,
          noOptionLabel: formData.noOptionLabel,
          yesOptionSymbol: formData.yesOptionSymbol,
          noOptionSymbol: formData.noOptionSymbol,
        },
        randomnessAddress,
        {
          switchboardQueue: switchboardQueueAddress,
          marketUsdcVault: marketUsdcVaultAddress,
        }
      );

      toast.success(t('market.create.dbSuccess', { defaultValue: 'Market created in database!' }));
      
      // Navigate to market page
      router.push(`/markets/${marketId}`);
    } catch (error: any) {
      console.error('Error creating market:', error);
      toast.error(error.message || t('market.create.error', { defaultValue: 'Failed to create market' }));
    } finally {
      setCreatingOnChain(false);
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{t('market.create.title', { defaultValue: 'Create New Market' })}</h1>
        <p className="text-muted-foreground">
          {t('market.create.subtitle', { defaultValue: 'Create a binary prediction market (YES/NO) with off-chain orderbook' })}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title - Required */}
        <Card>
          <CardHeader>
            <CardTitle>{t('market.create.titleLabel', { defaultValue: 'Market Title' })} *</CardTitle>
            <CardDescription>
              {t('market.create.titleDescription', { defaultValue: 'A clear and concise title for your prediction market' })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder={t('market.create.titlePlaceholder', { defaultValue: 'e.g., Will Bitcoin reach $100k by end of 2025?' })}
              className="text-lg"
            />
          </CardContent>
        </Card>

        {/* Description - Required */}
        <Card>
          <CardHeader>
            <CardTitle>{t('market.create.descriptionLabel', { defaultValue: 'Description' })} *</CardTitle>
            <CardDescription>
              {t('market.create.descriptionDescription', { defaultValue: 'Detailed information about the market, resolution criteria, and important dates' })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              placeholder={t('market.create.descriptionPlaceholder', { defaultValue: 'Provide details about:\n- What exactly is being predicted\n- How and when will this be resolved\n- What sources will be used for verification\n- Any important conditions or edge cases' })}
              className="resize-none"
            />
          </CardContent>
        </Card>

        {/* Category and Frequency */}
        <Card>
          <CardHeader>
            <CardTitle>{t('market.create.categoryTitle', { defaultValue: 'Category & Frequency' })}</CardTitle>
            <CardDescription>
              {t('market.create.categoryDescription', { defaultValue: 'Select a category and resolution frequency for your market' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Category Selector */}
              <div className="space-y-2">
                <Label htmlFor="category">{t('market.create.categoryLabel', { defaultValue: 'Category' })} *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder={t('market.create.selectCategory', { defaultValue: 'Select a category' })} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesLoading ? (
                      <SelectItem value="loading" disabled>
                        {t('common.loading', { defaultValue: 'Loading...' })}
                      </SelectItem>
                    ) : (
                      categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.slug}>
                          <div className="flex items-center gap-2">
                            {cat.icon && <span>{cat.icon}</span>}
                            <span>{isZh && cat.name_zh ? cat.name_zh : cat.name}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Frequency Selector */}
              <div className="space-y-2">
                <Label htmlFor="frequency">{t('market.create.frequencyLabel', { defaultValue: 'Frequency' })}</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value) => setFormData({ ...formData, frequency: value as FrequencyOption })}
                >
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(`market.create.frequency.${opt.value}`, { defaultValue: opt.labelKey })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Selected Category Preview */}
            {formData.category && (
              <div className="p-3 bg-muted/50 rounded-lg">
                {(() => {
                  const selectedCat = categories.find(c => c.slug === formData.category);
                  if (!selectedCat) return null;
                  return (
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selectedCat.icon}</span>
                      <div>
                        <div className="font-medium">
                          {isZh && selectedCat.name_zh ? selectedCat.name_zh : selectedCat.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t('market.create.categorySelected', { defaultValue: 'Category selected' })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Binary Market Info */}
        <Card className="border-purple-200 dark:border-purple-800">
          <CardHeader className="bg-purple-50 dark:bg-purple-950/20">
            <CardTitle className="flex items-center gap-2">
              {t('market.create.binaryMarketLabel', { defaultValue: 'Binary Market (YES/NO)' })}
              <span className="px-2 py-1 bg-purple-600 text-white text-xs font-semibold rounded">
                Default
              </span>
            </CardTitle>
            <CardDescription>
              {t('market.create.binaryMarketDescription', { defaultValue: 'Simple YES or NO outcome market with on-chain positions' })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="yes-label">YES Option Label</Label>
                <Input
                  id="yes-label"
                  type="text"
                  required
                  value={formData.yesOptionLabel}
                  onChange={(e) => setFormData({ ...formData, yesOptionLabel: e.target.value })}
                  placeholder="e.g., Will happen"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yes-symbol">YES Token Symbol</Label>
                <Input
                  id="yes-symbol"
                  type="text"
                  required
                  value={formData.yesOptionSymbol}
                  onChange={(e) => setFormData({ ...formData, yesOptionSymbol: e.target.value })}
                  placeholder="YES"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="no-label">NO Option Label</Label>
                <Input
                  id="no-label"
                  type="text"
                  required
                  value={formData.noOptionLabel}
                  onChange={(e) => setFormData({ ...formData, noOptionLabel: e.target.value })}
                  placeholder="e.g., Will not happen"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="no-symbol">NO Token Symbol</Label>
                <Input
                  id="no-symbol"
                  type="text"
                  required
                  value={formData.noOptionSymbol}
                  onChange={(e) => setFormData({ ...formData, noOptionSymbol: e.target.value })}
                  placeholder="NO"
                />
              </div>
            </div>
            {/* Info Banner */}
            <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-md text-sm border border-purple-200 dark:border-purple-700">
              <InfoIcon className="size-4 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
              <div className="text-purple-800 dark:text-purple-300">
                <p className="font-semibold mb-1">🎯 How it works:</p>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  <li>Each market has exactly 2 outcomes: YES and NO</li>
                  <li>Positions are tracked on-chain (no outcome tokens)</li>
                  <li>Trade YES/NO positions on the orderbook</li>
                  <li>Winning positions redeem for 1 USDC each after settlement</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Creation Costs */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-foreground">
                {t('market.create.estimatedCosts', { defaultValue: 'Estimated Creation Costs' })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCosts(!showCosts)}
              >
                {showCosts ? t('common.hideDetails', { defaultValue: 'Hide Details' }) : t('common.showDetails', { defaultValue: 'Show Details' })}
              </Button>
            </div>
            {showCosts && creationCosts && (
              <div className="text-sm text-muted-foreground space-y-2 mt-4">
                <div className="flex justify-between">
                  <span>{t('market.create.marketAccountRent', { defaultValue: 'Market Account Rent' })}:</span>
                  <span className="font-mono">{creationCosts.marketAccountRent?.toFixed(4) || '0.0000'} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('market.create.tokenMintRent', { defaultValue: 'Token Mint Rent' })}:</span>
                  <span className="font-mono">{(creationCosts.tokenMintRent || 0).toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    {t('market.create.randomnessAccountRent', { defaultValue: 'Randomness Account' })}
                    <span className="text-xs text-orange-600 dark:text-orange-400">✓ Fixed per market</span>
                  </span>
                  <span className="font-mono">{(creationCosts.randomnessAccountRent || 0).toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('market.create.creationFee', { defaultValue: 'Platform Fee' })}:</span>
                  <span className="font-mono">{creationCosts.creationFee || 10} USDC</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-blue-200 dark:border-blue-800 font-semibold text-foreground">
                  <span>{t('market.create.total', { defaultValue: 'Total' })}:</span>
                  <span className="font-mono">{(creationCosts.totalSol || 0).toFixed(4)} SOL + {creationCosts.totalUsdc || creationCosts.creationFee || 10} USDC</span>
                </div>
              </div>
            )}
            {/* Randomness Account Note */}
            <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-md text-xs border border-orange-200 dark:border-orange-700">
              <p className="text-orange-800 dark:text-orange-300">
                <strong>🎲 {t('market.create.randomnessNote', { defaultValue: 'Randomness Account:' })}</strong>{' '}
                {t('market.create.randomnessNoteText', { 
                  defaultValue: 'Each market has a fixed Switchboard randomness account for settlement checks. The creator pays rent once (~0.002 SOL) during market creation.'
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="flex-1"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type="submit"
            disabled={loading || creatingOnChain}
            className="flex-1"
          >
            {(loading || creatingOnChain) && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {loading 
              ? t('market.create.creating', { defaultValue: 'Creating Market...' })
              : creatingOnChain
              ? t('market.create.creatingOnChain', { defaultValue: 'Creating On-Chain...' })
              : t('market.create.createButton', { defaultValue: 'Create Market' })}
          </Button>
        </div>

        {/* Info Note */}
        <Card className="border-muted">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              <strong>{t('market.create.note', { defaultValue: 'Note' })}:</strong> {t('market.create.noteText', { defaultValue: 'Market creation involves on-chain transactions. You will need to approve transactions to:' })}
            </p>
            <ul className="text-xs text-muted-foreground list-disc list-inside mt-2 space-y-1">
              <li className="text-orange-700 dark:text-orange-400">{t('market.create.step0', { defaultValue: 'Create Switchboard randomness account (fixed per market)' })}</li>
              <li>{t('market.create.step1', { defaultValue: 'Create market account and pay rent' })}</li>
              <li>{t('market.create.step2', { defaultValue: 'Initialize market vault' })}</li>
              <li>{t('market.create.step3', { defaultValue: 'Pay creation fee (10 USDC)' })}</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3 p-2 bg-purple-50 dark:bg-purple-950/20 rounded border border-purple-200 dark:border-purple-700">
              <strong className="text-purple-600">{t('market.create.binaryNote', { defaultValue: '🎯 Binary Market:' })}</strong> {t('market.create.binaryDescription', {
                defaultValue: 'Users trade YES/NO positions on the orderbook and redeem positions at final prices after settlement.'
              })}
            </p>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
