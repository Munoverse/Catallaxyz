'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
  const [authenticated] = useState(false);
  const router = useRouter();
  
  const handleLogin = () => {
    alert('请使用 Solana 钱包连接（需要集成 Wallet Adapter）');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          catallaxyz 预测市场
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          基于 Solana 的去中心化预测市场平台
        </p>
        <div className="flex gap-4 justify-center">
          {!authenticated ? (
            <button
              onClick={handleLogin}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              开始使用
            </button>
          ) : (
            <button
              onClick={() => router.push('/create-market')}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              创建市场
            </button>
          )}
          <button
            onClick={() => router.push('/markets')}
            className="px-8 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:border-blue-600 hover:text-blue-600 transition"
          >
            浏览市场
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-8 mb-16">
        <div className="bg-white rounded-lg p-6 shadow-lg card-hover">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">快速交易</h3>
          <p className="text-gray-600">
            基于 Solana 的高性能区块链，实现毫秒级交易确认
          </p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-lg card-hover">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">安全可靠</h3>
          <p className="text-gray-600">
            智能合约经过审计，资金安全由区块链保障
          </p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-lg card-hover">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">简单易用</h3>
          <p className="text-gray-600">
            支持多种 Solana 钱包，安全便捷地管理资产
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-3xl font-bold mb-8 text-center">如何使用</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              1
            </div>
            <h3 className="font-semibold mb-2">登录注册</h3>
            <p className="text-sm text-gray-600">
              使用邮箱或社交账号登录，自动创建钱包
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              2
            </div>
            <h3 className="font-semibold mb-2">充值 USDC</h3>
            <p className="text-sm text-gray-600">
              转入 USDC 到你的钱包，开始交易
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              3
            </div>
            <h3 className="font-semibold mb-2">参与预测</h3>
            <p className="text-sm text-gray-600">
              选择市场，拆分 USDC 并交易 YES/NO tokens
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              4
            </div>
            <h3 className="font-semibold mb-2">赎回收益</h3>
            <p className="text-sm text-gray-600">
              市场结算后，赎回获胜方 token 获得收益
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-8 mt-16">
        <div className="text-center">
          <div className="text-4xl font-bold text-blue-600 mb-2">$0</div>
          <div className="text-gray-600">总交易量</div>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-purple-600 mb-2">0</div>
          <div className="text-gray-600">活跃市场</div>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-green-600 mb-2">0</div>
          <div className="text-gray-600">注册用户</div>
        </div>
      </div>
    </div>
  );
}

