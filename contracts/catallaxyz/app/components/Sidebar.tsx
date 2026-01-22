'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function Sidebar() {
  const authenticated = false;
  const user = null;
  const pathname = usePathname();
  const router = useRouter();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  
  const login = () => {
    alert('请使用 Solana 钱包连接（需要集成 Wallet Adapter）');
  };
  
  const logout = () => {
    alert('断开钱包连接');
  };

  const menuItems = [
    {
      name: '首页',
      path: '/',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: '市场列表',
      path: '/markets',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      name: '创建市场',
      path: '/create-market',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
      highlight: true,
    },
    {
      name: '我的持仓',
      path: '/portfolio',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      requireAuth: true,
    },
  ];

  const handleNavigation = (item: typeof menuItems[0]) => {
    console.log('🔍 Navigation clicked:', item.path, 'Authenticated:', authenticated);
    
    // Special handling for "Create Market" button
    if (item.path === '/create-market' && !authenticated) {
      console.log('🚫 Not authenticated, showing login prompt');
      setShowLoginPrompt(true);
      return;
    }
    
    if (item.requireAuth && !authenticated) {
      console.log('🔐 Auth required, opening login');
      login();
      return;
    }
    
    console.log('✅ Navigating to:', item.path);
    router.push(item.path);
  };

  return (
    <>
      {/* Login prompt modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl animate-slide-in">
            {/* Icon */}
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            
            {/* Title */}
            <h2 className="text-2xl font-bold text-center mb-3">Please Log In to Create a Market</h2>
            
            {/* Description */}
            <p className="text-gray-600 text-center mb-6">
              Creating a prediction market requires connecting a Solana wallet. Use Phantom, Solflare, or other supported wallets.
            </p>
            
            {/* Feature list */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
              <div className="flex items-center text-sm text-gray-700">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Automatically creates Solana wallet</span>
              </div>
              <div className="flex items-center text-sm text-gray-700">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>No need to remember seed phrase</span>
              </div>
              <div className="flex items-center text-sm text-gray-700">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Safe and convenient</span>
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
                Log In Now
              </button>
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="px-6 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="h-screen w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          catallaxyz
        </h1>
        <p className="text-xs text-gray-500 mt-1">预测市场平台</p>
      </div>

      {/* User info */}
      <div className="p-4 border-b border-gray-200">
        {authenticated && user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                {user.email?.email?.[0]?.toUpperCase() || 
                 user.google?.email?.[0]?.toUpperCase() || 
                 user.wallet?.address?.slice(0, 2) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.email?.email || user.google?.email || '用户'}
                </p>
                {user.wallet && (
                  <p className="text-xs text-gray-500 truncate">
                    {user.wallet.address.slice(0, 4)}...{user.wallet.address.slice(-4)}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full text-xs text-gray-600 hover:text-gray-900 text-left"
            >
              登出
            </button>
          </div>
        ) : (
          <button
            onClick={login}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
          >
            登录 / 注册
          </button>
        )}
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = pathname === item.path;
          const showLock = item.requireAuth && !authenticated;
          
          return (
            <button
              key={item.path}
              onClick={() => handleNavigation(item)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-lg transition
                ${isActive 
                  ? 'bg-blue-50 text-blue-600 font-medium' 
                  : 'text-gray-700 hover:bg-gray-50'
                }
                ${item.highlight && !isActive 
                  ? 'border-2 border-blue-200 hover:border-blue-300' 
                  : ''
                }
              `}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.name}</span>
              {showLock && (
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              )}
              {item.highlight && (
                <span className="px-2 py-1 text-xs bg-blue-600 text-white rounded">
                  New
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>网络</span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-medium">
            Devnet
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>版本</span>
          <span>v0.1.0</span>
        </div>
      </div>
      </div>
    </>
  );
}

