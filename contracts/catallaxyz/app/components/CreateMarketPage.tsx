'use client';

import { useState } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { useRouter } from 'next/navigation';

// Import your IDL
// import { IDL } from '../idl/catallaxyz';

const PROGRAM_ID = new PublicKey('7qEf2RpYjmtXXMMkVXmbNx75HfpzERc5jfxMdeEVVJaT');
const USDC_MINT = new PublicKey('DmPAkkBZ5hSv7GmioeNSa59jpTybHYRz5nt3NgwdQc4G');

interface FormData {
  title: string;
  description: string;
  yesDescription: string;
  noDescription: string;
  yesTokenName: string;
  noTokenName: string;
  yesTokenSymbol: string;
  noTokenSymbol: string;
  liquidityParameter: string; // Liquidity parameter (deprecated)
  initialLiquidity: string; // Initial liquidity (USDC)
  resolutionSource: string; // Resolution source
  endTime: string; // End time
}

export default function CreateMarketPage() {
  const router = useRouter();
  const authenticated = false;
  const wallets: any[] = [];
  
  const login = () => {
    alert('请使用 Solana 钱包连接（需要集成 Wallet Adapter）');
  };
  
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    yesDescription: 'This outcome will happen',
    noDescription: 'This outcome will not happen',
    yesTokenName: 'YES Token',
    noTokenName: 'NO Token',
    yesTokenSymbol: 'YES',
    noTokenSymbol: 'NO',
    liquidityParameter: '100',
    initialLiquidity: '1000',
    resolutionSource: '',
    endTime: '',
  });
  
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Handle form input
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      setError('请输入市场标题');
      return false;
    }
    if (!formData.description.trim()) {
      setError('请输入市场描述');
      return false;
    }
    if (!formData.yesTokenName.trim() || !formData.noTokenName.trim()) {
      setError('请输入 Token 名称');
      return false;
    }
    if (!formData.yesTokenSymbol.trim() || !formData.noTokenSymbol.trim()) {
      setError('请输入 Token 符号');
      return false;
    }
    if (parseFloat(formData.liquidityParameter) <= 0) {
      setError('流动性参数必须大于 0');
      return false;
    }
    if (parseFloat(formData.initialLiquidity) < 100) {
      setError('初始流动性至少需要 100 USDC');
      return false;
    }
    if (!formData.endTime) {
      setError('请选择结束时间');
      return false;
    }
    if (new Date(formData.endTime) <= new Date()) {
      setError('结束时间必须在未来');
      return false;
    }
    
    setError(null);
    return true;
  };

  // Create market
  const handleCreateMarket = async () => {
    // Check authentication
    if (!authenticated) {
      setShowLoginPrompt(true);
      return;
    }

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error('钱包未连接');
      }

      // Create connection
      const connection = new web3.Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        'confirmed'
      );

      // Create provider
      const provider = new AnchorProvider(
        connection,
        {
          publicKey: new PublicKey(wallet.address),
          signTransaction: async (tx) => {
            const signed = await wallet.signTransaction(tx);
            return signed;
          },
          signAllTransactions: async (txs) => {
            return await Promise.all(txs.map(tx => wallet.signTransaction(tx)));
          },
        },
        { commitment: 'confirmed' }
      );

      // Initialize program
      // const program = new Program(IDL, PROGRAM_ID, provider);
      
      // Generate market ID (hash or random)
      const marketSeed = formData.title.slice(0, 32);
      const [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('market'), Buffer.from(marketSeed)],
        PROGRAM_ID
      );

      // Generate YES and NO token mints
      const yesKeypair = web3.Keypair.generate();
      const noKeypair = web3.Keypair.generate();

      // Convert end time to Unix timestamp
      const endTimestamp = Math.floor(new Date(formData.endTime).getTime() / 1000);

      // Build create market params
      const createMarketParams = {
        title: formData.title,
        description: formData.description,
        yesDescription: formData.yesDescription,
        noDescription: formData.noDescription,
        liquidityParameter: new BN(parseFloat(formData.liquidityParameter) * 1_000_000),
        endTime: new BN(endTimestamp),
        resolutionSource: formData.resolutionSource,
      };

      console.log('创建市场参数:', createMarketParams);
      console.log('市场 PDA:', marketPda.toString());
      console.log('YES Mint:', yesKeypair.publicKey.toString());
      console.log('NO Mint:', noKeypair.publicKey.toString());

      // Call program (adjust per your IDL)
      /* 
      const tx = await program.methods
        .createMarket(createMarketParams)
        .accounts({
          creator: new PublicKey(wallet.address),
          market: marketPda,
          yesMint: yesKeypair.publicKey,
          noMint: noKeypair.publicKey,
          usdcMint: USDC_MINT,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([yesKeypair, noKeypair])
        .rpc();

      console.log('市场创建成功！交易签名:', tx);
      */

      // Temporary: simulate success
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('市场创建成功！(模拟)');

      // Navigate to market detail page
      router.push(`/market/${marketPda.toString()}`);

    } catch (err: any) {
      console.error('创建市场失败:', err);
      setError(err.message || '创建市场失败，请重试');
    } finally {
      setIsCreating(false);
    }
  };

  // Login prompt modal
  if (showLoginPrompt) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl animate-slide-in">
          {/* Icon */}
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          {/* Title */}
          <h2 className="text-2xl font-bold text-center mb-3">需要登录</h2>
          
          {/* Description */}
          <p className="text-gray-600 text-center mb-6">
            创建预测市场需要连接 Solana 钱包。支持 Phantom、Solflare 等多种钱包。
          </p>
          
          {/* Feature list */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
            <div className="flex items-center text-sm text-gray-700">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>自动创建 Solana 钱包</span>
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>无需记住助记词</span>
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>安全便捷</span>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowLoginPrompt(false);
                login();
              }}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition shadow-md hover:shadow-lg"
            >
              立即登录
            </button>
            <button
              onClick={() => setShowLoginPrompt(false)}
              className="px-6 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">创建预测市场</h1>
        <p className="text-gray-600">
          创建一个新的预测市场，让用户对未来事件进行预测和交易
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Basic info */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold border-b pb-2">基本信息</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              市场标题 *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="例如：比特币价格在 2024 年底会超过 $100,000 吗？"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={100}
            />
            <p className="text-sm text-gray-500 mt-1">{formData.title.length}/100</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              市场描述 *
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="详细描述这个预测市场的规则、结算条件等..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={500}
            />
            <p className="text-sm text-gray-500 mt-1">{formData.description.length}/500</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              结算来源
            </label>
            <input
              type="text"
              name="resolutionSource"
              value={formData.resolutionSource}
              onChange={handleChange}
              placeholder="例如：CoinGecko API, 官方公告等"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              结束时间 *
            </label>
            <input
              type="datetime-local"
              name="endTime"
              value={formData.endTime}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Outcome configuration */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold border-b pb-2">选项配置</h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            {/* YES option */}
            <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-green-800 flex items-center">
                <span className="bg-green-600 text-white px-2 py-1 rounded text-sm mr-2">YES</span>
                看涨选项
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选项描述
                </label>
                <input
                  type="text"
                  name="yesDescription"
                  value={formData.yesDescription}
                  onChange={handleChange}
                  placeholder="会发生"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token 名称 *
                </label>
                <input
                  type="text"
                  name="yesTokenName"
                  value={formData.yesTokenName}
                  onChange={handleChange}
                  placeholder="YES Token"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token 符号 *
                </label>
                <input
                  type="text"
                  name="yesTokenSymbol"
                  value={formData.yesTokenSymbol}
                  onChange={handleChange}
                  placeholder="YES"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  maxLength={10}
                />
              </div>
            </div>

            {/* NO option */}
            <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-red-800 flex items-center">
                <span className="bg-red-600 text-white px-2 py-1 rounded text-sm mr-2">NO</span>
                看跌选项
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选项描述
                </label>
                <input
                  type="text"
                  name="noDescription"
                  value={formData.noDescription}
                  onChange={handleChange}
                  placeholder="不会发生"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token 名称 *
                </label>
                <input
                  type="text"
                  name="noTokenName"
                  value={formData.noTokenName}
                  onChange={handleChange}
                  placeholder="NO Token"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token 符号 *
                </label>
                <input
                  type="text"
                  name="noTokenSymbol"
                  value={formData.noTokenSymbol}
                  onChange={handleChange}
                  placeholder="NO"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  maxLength={10}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Liquidity settings */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold border-b pb-2">流动性设置</h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                流动性参数 (b) *
              </label>
              <input
                type="number"
                name="liquidityParameter"
                value={formData.liquidityParameter}
                onChange={handleChange}
                placeholder="100"
                min="1"
                step="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-500 mt-1">
                越大的值意味着更深的流动性和更小的滑点
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                初始流动性 (USDC) *
              </label>
              <input
                type="number"
                name="initialLiquidity"
                value={formData.initialLiquidity}
                onChange={handleChange}
                placeholder="1000"
                min="100"
                step="100"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-500 mt-1">
                创建市场需要提供的初始 USDC（最少 100）
              </p>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-gray-700">预览</h3>
          <div className="text-sm text-gray-600">
            <p><strong>标题:</strong> {formData.title || '(未填写)'}</p>
            <p><strong>描述:</strong> {formData.description || '(未填写)'}</p>
            <p><strong>选项:</strong> {formData.yesTokenSymbol || 'YES'} vs {formData.noTokenSymbol || 'NO'}</p>
            <p><strong>初始流动性:</strong> {formData.initialLiquidity} USDC</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <button
            onClick={() => router.back()}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition"
            disabled={isCreating}
          >
            取消
          </button>
          <button
            onClick={handleCreateMarket}
            disabled={isCreating}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center justify-center"
          >
            {isCreating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                创建中...
              </>
            ) : (
              '创建市场'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

