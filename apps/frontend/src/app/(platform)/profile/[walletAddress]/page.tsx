'use client';

import { use, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProfileHeroCards from '@/components/Portfolio/ProfileHeroCards';
import UserDashboard from '@/components/UserDashboard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Settings } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface UserProfile {
  walletAddress: string;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  createdAt?: string;
}

interface PortfolioStats {
  positionsValue: number;
  biggestWin: number;
  predictions: number;
  profitLoss: number;
}

export default function ProfilePage() {
  const params = useParams();
  const walletAddress = params.walletAddress as string;
  const { publicKey } = usePhantomWallet();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);

  const isOwnProfile = publicKey?.toString() === walletAddress;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch user profile
        const profileRes = await apiFetch(`/api/users/${walletAddress}`);
        const profileData = await profileRes.json();

        if (profileData.success) {
          setProfile(profileData.data);
        } else {
          setError('Profile not found');
          return;
        }

        // Fetch user statistics
        const statsRes = await apiFetch(`/api/users/${walletAddress}/stats?refresh=1`);
        const statsData = await statsRes.json();

        if (statsData.success) {
          const data = statsData.data;
          setStats({
            positionsValue: parseFloat(data.totalPositionValue || '0') / 1_000_000,
            biggestWin: parseFloat(data.biggestWin || '0') / 1_000_000,
            predictions: data.totalPredictions || 0,
            profitLoss: parseFloat(data.totalPnl || '0') / 1_000_000,
          });
        }
      } catch (err: any) {
        console.error('Error fetching profile:', err);
        setError(err.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    if (walletAddress) {
      fetchProfile();
    }
  }, [walletAddress]);

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Profile Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error || 'The profile you are looking for does not exist.'}
          </p>
          <Button asChild>
            <Link href="/">Return Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const defaultStats: PortfolioStats = {
    positionsValue: 0,
    biggestWin: 0,
    predictions: 0,
    profitLoss: 0,
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Hero Cards Section */}
      <div className="space-y-6">
        {isOwnProfile && (
          <div className="flex justify-end">
            <Button asChild variant="outline">
              <Link href="/settings">
                <Settings className="size-4 mr-2" />
                Edit Profile
              </Link>
            </Button>
          </div>
        )}
        
        <ProfileHeroCards
          profile={{
            username: profile.username || `User ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
            avatarUrl: profile.avatarUrl || '',
            joinedAt: profile.createdAt,
            address: walletAddress,
          }}
          snapshot={stats || defaultStats}
          onCopyAddress={handleCopyAddress}
          addressCopied={addressCopied}
        />
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <UserDashboard walletAddress={walletAddress} />
        </TabsContent>

        <TabsContent value="positions" className="mt-6">
          <div className="text-center py-12 text-muted-foreground">
            <p>Positions view coming soon...</p>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <div className="text-center py-12 text-muted-foreground">
            <p>Activity view coming soon...</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Bio Section */}
      {profile.bio && (
        <div className="border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-3">About</h3>
          <p className="text-muted-foreground">{profile.bio}</p>
        </div>
      )}
    </div>
  );
}
