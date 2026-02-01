import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Get authenticated user ID from the request
 * @param request - The Next.js request object
 * @returns User ID if authenticated, null otherwise
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<string | null> {
  try {
    const supabase = createServerClient();
    
    // Get the user from the session
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    return user.id;
  } catch (error) {
    console.error('Error getting authenticated user:', error);
    return null;
  }
}

/**
 * Get authenticated user with full profile
 * @param request - The Next.js request object
 * @returns User object if authenticated, null otherwise
 */
export async function getAuthenticatedUserProfile(request: NextRequest) {
  try {
    const supabase = createServerClient();
    
    // Get the user from the session
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    // Optionally fetch additional profile data from your users table
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    
    return {
      id: user.id,
      email: user.email,
      ...profile,
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}
