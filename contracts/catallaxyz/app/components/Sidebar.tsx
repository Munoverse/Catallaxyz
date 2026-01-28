'use client';

import { useState, memo, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { UnifiedWalletButton } from '@jup-ag/wallet-adapter';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMagicAuth } from './magic-auth';
import LoginPromptModal from './LoginPromptModal';

// AUDIT FIX v2.1 (MED-26): Wrap component with React.memo for performance
function SidebarComponent() {
  const { connected, publicKey, disconnect } = useWallet();
  const { isMagicAuthenticated, magicMetadata, loginWithMagic, logoutMagic, error } = useMagicAuth();
  const authenticated = connected || isMagicAuthenticated;
  const userEmail = magicMetadata?.email;
  const magicPublicAddress = magicMetadata?.publicAddress;
  const pathname = usePathname();
  const router = useRouter();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  
  const login = useCallback(() => {
    setShowLoginPrompt(true);
  }, []);
  
  // AUDIT FIX v2.1 (MED-25): Add error handling to logout
  const logout = useCallback(async () => {
    try {
      if (connected) {
        await disconnect();
      }
      if (isMagicAuthenticated) {
        await logoutMagic();
      }
    } catch (err: unknown) {
      // Log error but don't throw - user should still see logged out state
      console.error('Logout error:', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [connected, disconnect, isMagicAuthenticated, logoutMagic]);

  const menuItems = [
    {
      name: 'Home',
      path: '/',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Markets',
      path: '/markets',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      name: 'Create Market',
      path: '/create-market',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
      highlight: true,
    },
    {
      name: 'Portfolio',
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
    // Special handling for "Create Market" button
    if (item.path === '/create-market' && !authenticated) {
      setShowLoginPrompt(true);
      return;
    }
    
    if (item.requireAuth && !authenticated) {
      login();
      return;
    }
    
    router.push(item.path);
  };

  return (
    <>
      <LoginPromptModal
        open={showLoginPrompt}
        onMagicLogin={() => loginWithMagic()}
        onClose={() => setShowLoginPrompt(false)}
        error={error}
      />

      <div className="h-screen w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          catallaxyz
        </h1>
        <p className="text-xs text-gray-500 mt-1">Prediction markets platform</p>
      </div>

      {/* User info */}
      <div className="p-4 border-b border-gray-200">
        {authenticated ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
                {userEmail?.[0]?.toUpperCase() ||
                 magicPublicAddress?.slice(0, 2) ||
                 publicKey?.toBase58().slice(0, 2) ||
                 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {userEmail || 'Wallet User'}
                </p>
                {(magicPublicAddress || publicKey) && (
                  <p className="text-xs text-gray-500 truncate">
                    {(magicPublicAddress || publicKey?.toBase58())?.slice(0, 4)}...
                    {(magicPublicAddress || publicKey?.toBase58())?.slice(-4)}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full text-xs text-gray-600 hover:text-gray-900 text-left"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={login}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
            >
              Sign In / Register
            </button>
            <UnifiedWalletButton className="w-full justify-center" />
          </div>
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
          <span>Network</span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-medium">
            Devnet
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Version</span>
          <span>v0.1.0</span>
        </div>
      </div>
      </div>
    </>
  );
}

