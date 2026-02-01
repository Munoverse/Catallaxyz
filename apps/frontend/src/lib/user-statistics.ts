/**
 * User Statistics
 * 
 * Tracks user performance: profit, loss, win rate, etc.
 * Also handles user follows (chain-off functionality)
 */

import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface UserStatistics {
  userId: string;
  totalProfit: number;
  totalLoss: number;
  winCount: number;
  lossCount: number;
  totalTrades: number;
  winRate: number | null;
  updatedAt: string;
}

/**
 * Get user statistics
 */
export async function getUserStatistics(userId: string): Promise<UserStatistics | null> {
  const { data, error } = await supabase
    .from('user_statistics')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    console.error('Error fetching user statistics:', error);
    return null;
  }
  
  return data;
}

/**
 * Update user statistics after a trade
 */
export async function updateUserStatistics(
  userId: string,
  profit: number, // Can be negative for losses
  isWin: boolean
): Promise<void> {
  // Get current statistics
  const current = await getUserStatistics(userId);
  
  const updates: Partial<UserStatistics> = {
    totalTrades: (current?.totalTrades || 0) + 1,
    winCount: (current?.winCount || 0) + (isWin ? 1 : 0),
    lossCount: (current?.lossCount || 0) + (isWin ? 0 : 1),
    updatedAt: new Date().toISOString(),
  };
  
  if (profit > 0) {
    updates.totalProfit = (current?.totalProfit || 0) + profit;
  } else {
    updates.totalLoss = (current?.totalLoss || 0) + Math.abs(profit);
  }
  
  // Calculate win rate
  if (updates.totalTrades) {
    updates.winRate = (updates.winCount || 0) / updates.totalTrades;
  }
  
  // Upsert statistics
  const { error } = await supabase
    .from('user_statistics')
    .upsert({
      user_id: userId,
      ...updates,
    });
  
  if (error) {
    console.error('Error updating user statistics:', error);
    throw error;
  }
}

/**
 * Follow a user
 */
export async function followUser(
  followerId: string,
  followingId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_follows')
    .insert({
      follower_id: followerId,
      following_id: followingId,
    });
  
  if (error) {
    console.error('Error following user:', error);
    throw error;
  }
}

/**
 * Unfollow a user
 */
export async function unfollowUser(
  followerId: string,
  followingId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  
  if (error) {
    console.error('Error unfollowing user:', error);
    throw error;
  }
}

/**
 * Check if user is following another user
 */
export async function isFollowing(
  followerId: string,
  followingId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error checking follow status:', error);
    return false;
  }
  
  return !!data;
}

/**
 * Get users that a user is following
 */
export async function getFollowing(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', userId);
  
  if (error) {
    console.error('Error fetching following:', error);
    return [];
  }
  
  return data.map(row => row.following_id);
}

/**
 * Get followers of a user
 */
export async function getFollowers(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_follows')
    .select('follower_id')
    .eq('following_id', userId);
  
  if (error) {
    console.error('Error fetching followers:', error);
    return [];
  }
  
  return data.map(row => row.follower_id);
}

