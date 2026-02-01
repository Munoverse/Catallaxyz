import type { FastifyInstance } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { buildCacheKey, getCache, setCache } from '../lib/cache.js';
import { getAuthContext } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

const USER_PROFILE_CACHE_TTL_MS = 300_000;

// User type for database queries
interface DbUser {
  id: string;
  wallet_address: string | null;
  magic_user_id: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
  username_verified: boolean | null;
  auth_provider: string | null;
  profile_views: number | null;
  total_profit_loss: number | null;
  biggest_win: number | null;
  total_predictions: number | null;
}

// User stats type
interface DbUserStats {
  total_volume: number | null;
  total_pnl: number | null;
  total_trades: number | null;
  win_rate: number | null;
  avg_trade_size: number | null;
  best_trade_pnl: number | null;
  worst_trade_pnl: number | null;
  markets_traded: number | null;
  markets_created: number | null;
  realized_pnl: number | null;
  unrealized_pnl: number | null;
  biggest_win: number | null;
  total_position_value: number | null;
  markets_participated: number | null;
  active_positions: number | null;
  total_predictions: number | null;
  terminations_count: number | null;
  usdc_balance: number | null;
  last_balance_update: string | null;
  created_at: string | null;
  last_login_at: string | null;
}

// Standard user fields for SELECT queries (avoid SELECT *)
const userFields = `
  id, wallet_address, magic_user_id, username, avatar_url, bio, 
  created_at, updated_at, username_verified, auth_provider,
  profile_views, total_profit_loss, biggest_win, total_predictions
`.replace(/\s+/g, ' ').trim();

function handleAuthError(reply: any, error: any) {
  if (error?.statusCode === 401) {
    return reply.code(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: error.message || 'Unauthorized' },
    });
  }
  return null;
}

export default async function usersRoutes(app: FastifyInstance) {
  app.post('/users/auth', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress, username, avatarUrl } = body;

      logger.debug('users/auth', 'Processing auth request', { hasWallet: !!walletAddress, hasUsername: !!username });

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      const cacheKey = buildCacheKey('users:profile', { walletAddress });
      const cached = getCache(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      let supabase;
      try {
        supabase = createServerClient();
      } catch (error: any) {
        logger.error('users/auth', 'Failed to create Supabase client', error);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Database connection failed', details: error.message },
        });
      }

      const auth = await getAuthContext({ request, supabase });
      if (auth.kind === 'wallet' && auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      let existingUser: DbUser | null = null;
      let selectError: any = null;

      const { data: walletUser, error: walletError } = await supabase
        .from('users')
        .select(userFields)
        .eq('wallet_address', auth.walletAddress)
        .single();
      if (walletUser) {
        existingUser = walletUser as unknown as DbUser;
      } else if (walletError && (walletError as any).code !== 'PGRST116') {
        selectError = walletError;
      }

      logger.debug('users/auth', 'User lookup result', { found: !!existingUser, hasError: !!selectError });
      if (selectError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: (selectError as any).message || 'User lookup failed' },
        });
      }

      if (existingUser) {
        const updateData: any = {
          updated_at: new Date().toISOString(),
        };

        if (walletAddress && walletAddress !== existingUser.wallet_address) {
          updateData.wallet_address = walletAddress;
        }

        if (avatarUrl && avatarUrl !== existingUser.avatar_url) {
          updateData.avatar_url = avatarUrl;
        }

        if (username && !existingUser.username) {
          const { data: usernameCheck } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();

          if (!usernameCheck) {
            updateData.username = username;
          }
        }

        if (Object.keys(updateData).length > 1) {
          const { data: updatedUserData, error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', existingUser.id)
            .select()
            .single();

          if (updateError || !updatedUserData) {
            return reply.code(500).send({
              success: false,
              error: { code: 'SERVER_ERROR', message: updateError?.message || 'Update failed' },
            });
          }

          const updatedUser = updatedUserData as unknown as DbUser;
          const response = {
            success: true,
            data: {
              id: updatedUser.id,
              walletAddress: updatedUser.wallet_address,
              username: updatedUser.username,
              avatarUrl: updatedUser.avatar_url,
              bio: updatedUser.bio,
              createdAt: updatedUser.created_at,
              updatedAt: updatedUser.updated_at,
            },
          };
          setCache(cacheKey, response, USER_PROFILE_CACHE_TTL_MS);
          return reply.send(response);
        }

        const response = {
          success: true,
          data: {
            id: existingUser.id,
            walletAddress: existingUser.wallet_address,
            username: existingUser.username,
            avatarUrl: existingUser.avatar_url,
            bio: existingUser.bio,
            createdAt: existingUser.created_at,
            updatedAt: existingUser.updated_at,
          },
        };
        setCache(cacheKey, response, USER_PROFILE_CACHE_TTL_MS);
        return reply.send(response);
      }

      if (username) {
        const { data: usernameCheck } = await supabase
          .from('users')
          .select('id')
          .eq('username', username)
          .single();

        if (usernameCheck) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Username already taken' },
          });
        }
      }

      const insertPayload: Record<string, any> = {
        wallet_address: walletAddress,
        username: username || null,
        avatar_url: avatarUrl || null,
        auth_provider: 'wallet',
      };

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([insertPayload])
        .select()
        .single();

      logger.debug('users/auth', 'User created', { userId: newUser?.id, hasError: !!insertError });

      if (insertError) {
        logger.error('users/auth', 'Insert error', insertError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: insertError.message, details: insertError },
        });
      }

      const response = {
        success: true,
        data: {
          id: newUser.id,
          walletAddress: newUser.wallet_address,
          username: newUser.username,
          avatarUrl: newUser.avatar_url,
          bio: newUser.bio,
          createdAt: newUser.created_at,
          updatedAt: newUser.updated_at,
        },
      };
      setCache(cacheKey, response, USER_PROFILE_CACHE_TTL_MS);
      return reply.send(response);
    } catch (error: any) {
      const authResponse = handleAuthError(reply, error);
      if (authResponse) return authResponse;
      logger.error('users/auth', 'Unexpected error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      });
    }
  });

  app.post('/users/update', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress, username, bio, twitterHandle, emailAddress, displayName, avatarUrl } = body;

      logger.debug('users/update', 'Processing update request', { hasWallet: !!walletAddress, hasUsername: !!username });

      const supabase = createServerClient();
      const auth = await getAuthContext({ request, supabase });

      if (auth.kind === 'wallet' && walletAddress && auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      let existingUser: DbUser | null = null;
      let queryError: any = null;
      const { data: user, error } = await supabase
        .from('users')
        .select(userFields)
        .eq('wallet_address', auth.walletAddress)
        .single();
      existingUser = user as unknown as DbUser | null;
      queryError = error;

      if (queryError || !existingUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
      }

      if (username && username !== existingUser.username) {
        const { data: usernameTaken } = await supabase
          .from('users')
          .select('id')
          .eq('username', username)
          .single();

        if (usernameTaken) {
          return reply.code(409).send({
            success: false,
            error: { code: 'USERNAME_TAKEN', message: 'Username is already taken' },
          });
        }
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (username !== undefined) updateData.username = username;
      if (bio !== undefined) updateData.bio = bio;
      if (twitterHandle !== undefined) updateData.twitter_handle = twitterHandle;
      if (emailAddress !== undefined) updateData.email = emailAddress;
      if (displayName !== undefined) updateData.display_name = displayName;
      if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;

      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateError) {
        logger.error('users/update', 'Update error', updateError);
        throw updateError;
      }

      logger.debug('users/update', 'User updated', { hasUsername: !!updatedUser.username });

      return reply.send({
        success: true,
        user: updatedUser,
      });
    } catch (error) {
      const authResponse = handleAuthError(reply, error);
      if (authResponse) return authResponse;
      logger.error('users/update', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  });

  app.post('/users/by-wallet', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress } = body;

      logger.debug('users/by-wallet', 'Processing request', { hasWallet: !!walletAddress });

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      const supabase = createServerClient();
      const auth = await getAuthContext({ request, supabase });
      if (auth.kind === 'wallet' && auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const { data: existingUserData, error: queryError } = await supabase
        .from('users')
        .select(userFields)
        .eq('wallet_address', walletAddress)
        .single();

      if (queryError) {
        if ((queryError as any).code === 'PGRST116') {
          logger.debug('users/by-wallet', 'User not found');
          return reply.code(404).send({
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User not found' },
          });
        }
        throw queryError;
      }

      if (!existingUserData) {
        return reply.code(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
      }

      const existingUser = existingUserData as unknown as DbUser;
      logger.debug('users/by-wallet', 'User found', { hasUsername: !!existingUser.username });

      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', existingUser.id);

      return reply.send({
        success: true,
        user: existingUser,
      });
    } catch (error) {
      const authResponse = handleAuthError(reply, error);
      if (authResponse) return authResponse;
      logger.error('users/by-wallet', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  });

  app.post('/users/register-username', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress, username } = body;

      logger.debug('users/register-username', 'Processing request', { hasWallet: !!walletAddress, hasUsername: !!username });

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      if (!username) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'username is required' },
        });
      }

      if (username.length < 3 || username.length > 30) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Username must be between 3 and 30 characters' },
        });
      }

      const usernameRegex = /^[a-zA-Z0-9_-]+$/;
      if (!usernameRegex.test(username)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Username can only contain letters, numbers, underscores, and hyphens',
          },
        });
      }

      const supabase = createServerClient();
      const auth = await getAuthContext({ request, supabase });
      if (auth.kind === 'wallet' && auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const { data: existingUserData, error: selectError } = await supabase
        .from('users')
        .select(userFields)
        .eq('wallet_address', walletAddress)
        .single();

      if (selectError && (selectError as any).code !== 'PGRST116') {
        logger.error('users/register-username', 'Select error', selectError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: (selectError as any).message },
        });
      }

      const existingUser = existingUserData as unknown as DbUser | null;

      const { data: usernameCheck } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (usernameCheck) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Username is already taken' },
        });
      }

      if (existingUser) {
        if (existingUser.username && existingUser.username_verified) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Username already set' },
          });
        }

        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({
            username,
            username_verified: true,
            wallet_address: walletAddress || existingUser.wallet_address,
            auth_provider: existingUser.auth_provider || 'wallet',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingUser.id)
          .select()
          .single();

        if (updateError) {
          logger.error('users/register-username', 'Update error', updateError);
          return reply.code(500).send({
            success: false,
            error: { code: 'SERVER_ERROR', message: updateError.message },
          });
        }

        return reply.send({
          success: true,
          data: {
            id: updatedUser.id,
            walletAddress: updatedUser.wallet_address,
            username: updatedUser.username,
            usernameVerified: updatedUser.username_verified,
            createdAt: updatedUser.created_at,
            updatedAt: updatedUser.updated_at,
          },
        });
      }

      const insertPayload: Record<string, any> = {
        wallet_address: walletAddress,
        username,
        username_verified: true,
        auth_provider: 'wallet',
      };

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([insertPayload])
        .select()
        .single();

      if (insertError) {
        logger.error('users/register-username', 'Insert error', insertError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: insertError.message },
        });
      }

      return reply.send({
        success: true,
        data: {
          id: newUser.id,
          walletAddress: newUser.wallet_address,
          username: newUser.username,
          usernameVerified: newUser.username_verified,
          createdAt: newUser.created_at,
          updatedAt: newUser.updated_at,
        },
      });
    } catch (error: any) {
      const authResponse = handleAuthError(reply, error);
      if (authResponse) return authResponse;
      logger.error('users/register-username', 'Unexpected error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      });
    }
  });

  app.get('/users/check-username', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const username = query.username;

      if (!username) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'username parameter is required' },
        });
      }

      if (username.length < 3 || username.length > 30) {
        return reply.send({
          success: true,
          data: {
            available: false,
            reason: 'Username must be between 3 and 30 characters',
          },
        });
      }

      const usernameRegex = /^[a-zA-Z0-9_-]+$/;
      if (!usernameRegex.test(username)) {
        return reply.send({
          success: true,
          data: {
            available: false,
            reason: 'Username can only contain letters, numbers, underscores, and hyphens',
          },
        });
      }

      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (error && (error as any).code !== 'PGRST116') {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      const available = !data;

      return reply.send({
        success: true,
        data: {
          available,
          username,
          reason: available ? null : 'Username is already taken',
        },
      });
    } catch (error: any) {
      logger.error('users/check-username', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/users/create-with-username', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress, username, displayName } = body;

      logger.debug('users/create-with-username', 'Processing request', { hasWallet: !!walletAddress, hasUsername: !!username });

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      if (!username) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'username is required' },
        });
      }

      if (username.length < 3 || username.length > 30) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Username must be between 3 and 30 characters' },
        });
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Username can only contain letters, numbers, underscores, and hyphens',
          },
        });
      }

      const supabase = createServerClient();
      const auth = await getAuthContext({ request, supabase });
      if (auth.kind === 'wallet' && auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const { data: existingUsername } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (existingUsername) {
        return reply.code(409).send({
          success: false,
          error: { code: 'USERNAME_TAKEN', message: 'Username is already taken' },
        });
      }

      const { data: existingWallet } = await supabase
        .from('users')
        .select('id, username, wallet_address, auth_provider')
        .eq('wallet_address', walletAddress)
        .single();

      if (existingWallet) {
        if (!existingWallet.username) {
          const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({
              username: username,
              display_name: displayName || username,
              username_verified: true,
              auth_provider: existingWallet.auth_provider || 'wallet',
              updated_at: new Date().toISOString(),
              last_login_at: new Date().toISOString(),
            })
            .eq('id', existingWallet.id)
            .select()
            .single();

          if (updateError) {
            throw updateError;
          }

          return reply.send({
            success: true,
            user: updatedUser,
          });
        }

        return reply.code(409).send({
          success: false,
          error: { code: 'WALLET_EXISTS', message: 'This wallet already has an account' },
        });
      }

      const insertPayload: Record<string, any> = {
        wallet_address: walletAddress,
        username: username,
        display_name: displayName || username,
        username_verified: true,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
        auth_provider: 'wallet',
      };

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        logger.error('users/create-with-username', 'Insert error', insertError);
        throw insertError;
      }

      logger.debug('users/create-with-username', 'User created', { userId: newUser?.id });

      return reply.send({
        success: true,
        user: newUser,
      });
    } catch (error) {
      const authResponse = handleAuthError(reply, error);
      if (authResponse) return authResponse;
      logger.error('users/create-with-username', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  });

  app.get('/users/by-username/:username', async (request, reply) => {
    try {
      const { username } = request.params as { username: string };

      if (!username) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'username is required' },
        });
      }

      const cacheKey = buildCacheKey('users:by-username', { username });
      const cached = getCache(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('users')
        .select(userFields)
        .eq('username', username)
        .single();

      if (error || !data) {
        if ((error as any)?.code === 'PGRST116') {
          return reply.code(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'User not found' },
          });
        }
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error?.message || 'User not found' },
        });
      }

      const user = data as unknown as DbUser;

      const { error: viewError } = await supabase.rpc('increment_profile_views', {
        p_user_id: user.id,
      });
      const viewsCount = Number(user.profile_views || 0) + (viewError ? 0 : 1);
      const profitLoss = Number(user.total_profit_loss || 0) / 1e6;
      const positionsValue = 0;
      const biggestWin = Number(user.biggest_win || 0) / 1e6;
      const predictions = Number(user.total_predictions || 0);

      const response = {
        success: true,
        data: {
          walletAddress: user.wallet_address,
          username: user.username,
          avatarUrl: user.avatar_url,
          bio: user.bio,
          createdAt: user.created_at,
          viewsCount,
          stats: {
            profitLoss,
            positionsValue,
            biggestWin,
            predictions,
          },
        },
      };

      setCache(cacheKey, response, USER_PROFILE_CACHE_TTL_MS);

      return reply.send(response);
    } catch (error: any) {
      logger.error('users/by-username', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/users/operations', async (request, reply) => {
    try {
      const body = request.body as Record<string, any>;
      const { walletAddress, operationType, amount, fee, outcomeType, description, transactionSignature, metadata } = body;

      if (!walletAddress || !operationType || !amount) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'walletAddress, operationType, amount are required',
          },
        });
      }

      const supabase = createServerClient();
      const auth = await getAuthContext({ request, supabase });
      if (auth.kind === 'wallet' && auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', auth.walletAddress)
        .single();
      const userId = user?.id || null;

      if (!userId) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const { data: operation, error: insertError } = await supabase
        .from('user_operations')
        .insert({
          user_id: userId,
          operation_type: operationType,
          amount,
          fee: fee || 0,
          outcome_type: outcomeType || null,
          description: description || null,
          transaction_signature: transactionSignature || null,
          metadata: metadata || {},
        })
        .select()
        .single();

      if (insertError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: insertError.message },
        });
      }

      return reply.send({ success: true, data: operation });
    } catch (error: any) {
      const authResponse = handleAuthError(reply, error);
      if (authResponse) return authResponse;
      logger.error('users/operations', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      });
    }
  });

  app.get('/users/:walletAddress', async (request, reply) => {
    try {
      const { walletAddress } = request.params as { walletAddress: string };

      logger.debug('users/get', 'Processing request', { hasWallet: !!walletAddress });

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      const cacheKey = buildCacheKey('users:profile', { walletAddress });
      const cached = getCache(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      let supabase;
      try {
        supabase = createServerClient();
      } catch (error: any) {
        logger.error('users/get', 'Failed to create Supabase client', error);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Database connection failed', details: error.message },
        });
      }

      const { data, error } = await supabase
        .from('users')
        .select(userFields)
        .eq('wallet_address', walletAddress)
        .single();

      logger.debug('users/get', 'Query result', { found: !!data, hasError: !!error });

      if (error || !data) {
        if ((error as any)?.code === 'PGRST116') {
          logger.debug('users/get', 'User not found');
          return reply.code(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'User not found' },
          });
        }
        logger.error('users/get', 'Query error', error);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error?.message || 'Unknown error', details: error },
        });
      }

      const user = data as unknown as DbUser;

      const { error: viewError } = await supabase.rpc('increment_profile_views', {
        p_user_id: user.id,
      });
      const viewsCount = Number(user.profile_views || 0) + (viewError ? 0 : 1);
      const profitLoss = Number(user.total_profit_loss || 0) / 1e6;
      const positionsValue = 0;
      const biggestWin = Number(user.biggest_win || 0) / 1e6;
      const predictions = Number(user.total_predictions || 0);

      const response = {
        success: true,
        data: {
          walletAddress: user.wallet_address,
          username: user.username,
          avatarUrl: user.avatar_url,
          bio: user.bio,
          createdAt: user.created_at,
          viewsCount,
          stats: {
            profitLoss,
            positionsValue,
            biggestWin,
            predictions,
          },
        },
      };
      setCache(cacheKey, response, USER_PROFILE_CACHE_TTL_MS);
      return reply.send(response);
    } catch (error: any) {
      logger.error('users/get', 'Unexpected error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      });
    }
  });

  app.patch('/users/:walletAddress', async (request, reply) => {
    try {
      const { walletAddress } = request.params as { walletAddress: string };
      const body = request.body as Record<string, any>;

      logger.debug('users/patch', 'Processing request', { hasWallet: !!walletAddress });

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      let supabase;
      try {
        supabase = createServerClient();
      } catch (error: any) {
        logger.error('users/patch', 'Failed to create Supabase client', error);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Database connection failed', details: error.message },
        });
      }

      const auth = await getAuthContext({ request, supabase });
      if (auth.kind === 'wallet' && auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      let { data: existingUser, error: userError } = await supabase
        .from('users')
        .select('id, username, wallet_address')
        .eq('wallet_address', walletAddress)
        .single();

      if (userError && (userError as any).code === 'PGRST116') {
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert([
            {
              wallet_address: walletAddress,
              auth_provider: 'wallet',
            },
          ])
          .select('id, username, wallet_address')
          .single();

        if (createError) {
          return reply.code(500).send({
            success: false,
            error: { code: 'SERVER_ERROR', message: `Failed to create user: ${createError.message}` },
          });
        }

        existingUser = newUser;
      } else if (userError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: userError.message },
        });
      }

      if (!existingUser) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: 'Failed to get or create user' },
        });
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (body.username !== undefined) {
        if (body.username === null || body.username === '') {
          updateData.username = null;
        } else {
          if (body.username.length < 3 || body.username.length > 30) {
            return reply.code(400).send({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Username must be between 3 and 30 characters' },
            });
          }

          const usernameRegex = /^[a-zA-Z0-9_-]+$/;
          if (!usernameRegex.test(body.username)) {
            return reply.code(400).send({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Username can only contain letters, numbers, underscores, and hyphens',
              },
            });
          }

          if (body.username !== existingUser.username) {
            const { data: usernameCheck } = await supabase
              .from('users')
              .select('id')
              .eq('username', body.username)
              .single();

            if (usernameCheck) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Username is already taken' },
              });
            }
          }

          updateData.username = body.username;
        }
      }

      if (body.bio !== undefined) {
        if (body.bio === null || body.bio === '') {
          updateData.bio = null;
        } else {
          if (body.bio.length > 200) {
            return reply.code(400).send({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Bio must be 200 characters or less' },
            });
          }
          updateData.bio = body.bio;
        }
      }

      if (body.avatarUrl !== undefined) {
        updateData.avatar_url = body.avatarUrl || null;
      }

      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: updateError.message },
        });
      }

      return reply.send({
        success: true,
        data: {
          walletAddress: updatedUser.wallet_address,
          username: updatedUser.username,
          avatarUrl: updatedUser.avatar_url,
          bio: updatedUser.bio,
          updatedAt: updatedUser.updated_at,
        },
      });
    } catch (error: any) {
      const authResponse = handleAuthError(reply, error);
      if (authResponse) return authResponse;
      logger.error('users/patch', 'Unexpected error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      });
    }
  });

  app.get('/users/:walletAddress/markets', async (request, reply) => {
    try {
      const { walletAddress } = request.params as { walletAddress: string };

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      const supabase = createServerClient();

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (userError || !user) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const marketPerfFields = 'market_id, total_pnl, total_volume, win_count, loss_count, last_trade_at';
      const { data: markets, error: marketsError } = await supabase
        .from('user_market_performance')
        .select(marketPerfFields)
        .eq('user_id', user.id)
        .order('total_pnl', { ascending: false });

      if (marketsError) {
        logger.error('users/markets', 'Markets error', marketsError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: marketsError.message },
        });
      }

      return reply.send({
        success: true,
        data: {
          markets: (markets || []).map((m: any) => ({
            marketId: m.market_id,
            marketTitle: m.market_title,
            marketStatus: m.market_status,
            numPositions: m.num_positions || 0,
            totalPositionValue: m.total_position_value?.toString() || '0',
            realizedPnl: m.realized_pnl?.toString() || '0',
            unrealizedPnl: m.unrealized_pnl?.toString() || '0',
            totalPnl: m.total_pnl?.toString() || '0',
            numTrades: m.num_trades || 0,
            totalVolume: m.total_volume?.toString() || '0',
            firstPositionDate: m.first_position_date,
            lastActivityDate: m.last_activity_date,
          })),
        },
      });
    } catch (error: any) {
      logger.error('users/markets', 'Unexpected error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      });
    }
  });

  app.get('/users/:walletAddress/stats', async (request, reply) => {
    try {
      const { walletAddress } = request.params as { walletAddress: string };
      const { refresh } = request.query as { refresh?: string };

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      const supabase = createServerClient();
      const shouldRefresh =
        refresh === '1' ||
        refresh === 'true' ||
        refresh === 'yes' ||
        refresh === 'refresh';

      if (shouldRefresh) {
        const { error: refreshError } = await supabase.rpc('refresh_user_stats_materialized');
        if (refreshError) {
          logger.warn('users/stats', 'Failed to refresh user_stats materialized view', refreshError);
        }
      }

      const statsFields = `
        total_volume, total_pnl, total_trades, win_rate, avg_trade_size, 
        best_trade_pnl, worst_trade_pnl, markets_traded, markets_created,
        realized_pnl, unrealized_pnl, biggest_win, total_position_value,
        markets_participated, active_positions, total_predictions,
        terminations_count, usdc_balance, last_balance_update, created_at, last_login_at
      `.replace(/\s+/g, ' ').trim();
      const { data: statsData, error: statsError } = await supabase
        .from('user_stats')
        .select(statsFields)
        .eq('wallet_address', walletAddress)
        .single();

      if (statsError && (statsError as any).code !== 'PGRST116') {
        logger.error('users/stats', 'Stats error', statsError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: statsError.message },
        });
      }

      if (!statsData) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const stats = statsData as unknown as DbUserStats;

      return reply.send({
        success: true,
        data: {
          marketsCreated: stats.markets_created || 0,
          totalTrades: stats.total_trades || 0,
          totalVolume: stats.total_volume?.toString() || '0',
          realizedPnl: stats.realized_pnl?.toString() || '0',
          unrealizedPnl: stats.unrealized_pnl?.toString() || '0',
          totalPnl: stats.total_pnl?.toString() || '0',
          biggestWin: stats.biggest_win?.toString() || '0',
          totalPositionValue: stats.total_position_value?.toString() || '0',
          marketsParticipated: stats.markets_participated || 0,
          activePositions: stats.active_positions || 0,
          totalPredictions: stats.total_predictions || 0,
          terminationsCount: stats.terminations_count || 0,
          usdcBalance: stats.usdc_balance?.toString() || '0',
          lastBalanceUpdate: stats.last_balance_update,
          createdAt: stats.created_at,
          lastLoginAt: stats.last_login_at,
        },
      });
    } catch (error: any) {
      logger.error('users/stats', 'Unexpected error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      });
    }
  });

  app.get('/users/:walletAddress/operations', async (request, reply) => {
    try {
      const { walletAddress } = request.params as { walletAddress: string };
      const query = request.query as Record<string, string | undefined>;
      const limit = parseInt(query.limit || '20', 10);
      const offset = parseInt(query.offset || '0', 10);

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      const supabase = createServerClient();

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (userError || !user) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const { data: operations, error: opsError } = await supabase
        .from('user_operations')
        .select(
          `
        *,
        markets:market_id (
          id,
          title
        )
      `
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (opsError) {
        logger.error('users/operations', 'Operations error', opsError);
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: opsError.message },
        });
      }

      return reply.send({
        success: true,
        data: {
          operations: (operations || []).map((op: any) => ({
            id: op.id,
            operationType: op.operation_type,
            marketId: op.market_id,
            marketTitle: op.markets?.title || 'Unknown Market',
            questionIndex: op.question_index,
            outcomeType: op.outcome_type,
            amount: op.amount?.toString() || '0',
            fee: op.fee?.toString() || '0',
            description: op.description,
            metadata: op.metadata,
            transactionSignature: op.transaction_signature,
            slot: op.slot,
            createdAt: op.created_at,
          })),
          pagination: {
            limit,
            offset,
            hasMore: operations && operations.length === limit,
          },
        },
      });
    } catch (error: any) {
      logger.error('users/operations', 'Unexpected error', error);
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Internal server error',
        },
      });
    }
  });

  app.get('/users/:walletAddress/follows', async (request, reply) => {
    try {
      const { walletAddress } = request.params as { walletAddress: string };
      const query = request.query as Record<string, string | undefined>;
      const type = query.type || 'following';

      if (!walletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'walletAddress is required' },
        });
      }

      const supabase = createServerClient();

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (userError || !user) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      let followsData;
      if (type === 'followers') {
        const { data, error } = await supabase
          .from('user_follows')
          .select(
            `
          id,
          created_at,
          follower:follower_id (
            id,
            wallet_address,
            username,
            avatar_url,
            bio
          )
        `
          )
          .eq('following_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          return reply.code(500).send({
            success: false,
            error: { code: 'SERVER_ERROR', message: error.message },
          });
        }

        followsData = data.map((item: any) => ({
          id: item.id,
          user: item.follower,
          created_at: item.created_at,
        }));
      } else {
        const { data, error } = await supabase
          .from('user_follows')
          .select(
            `
          id,
          created_at,
          following:following_id (
            id,
            wallet_address,
            username,
            avatar_url,
            bio
          )
        `
          )
          .eq('follower_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          return reply.code(500).send({
            success: false,
            error: { code: 'SERVER_ERROR', message: error.message },
          });
        }

        followsData = data.map((item: any) => ({
          id: item.id,
          user: item.following,
          created_at: item.created_at,
        }));
      }

      return reply.send({
        success: true,
        data: {
          type,
          follows: followsData,
          count: followsData.length,
        },
      });
    } catch (error: any) {
      logger.error('users/follows', 'Error', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.post('/users/:walletAddress/follows', async (request, reply) => {
    try {
      const { walletAddress } = request.params as { walletAddress: string };
      const body = request.body as Record<string, any>;
      const { followingWalletAddress } = body;

      if (!walletAddress || !followingWalletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Both wallet addresses are required' },
        });
      }

      if (walletAddress === followingWalletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Cannot follow yourself' },
        });
      }

      const supabase = createServerClient();

      // SECURITY FIX: Require authentication and verify wallet ownership
      const auth = await getAuthContext({ request, supabase });
      if (auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const { data: followerUser, error: followerError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (followerError || !followerUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Follower user not found' },
        });
      }

      const { data: followingUser, error: followingError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', followingWalletAddress)
        .single();

      if (followingError || !followingUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Following user not found' },
        });
      }

      const { data: existingFollow } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', followerUser.id)
        .eq('following_id', followingUser.id)
        .single();

      if (existingFollow) {
        return reply.send({
          success: true,
          data: {
            message: 'Already following',
            followId: existingFollow.id,
          },
        });
      }

      const { data: newFollow, error: insertError } = await supabase
        .from('user_follows')
        .insert([
          {
            follower_id: followerUser.id,
            following_id: followingUser.id,
          },
        ])
        .select()
        .single();

      if (insertError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: insertError.message },
        });
      }

      await Promise.all([
        supabase.rpc('increment_following_count', { user_id: followerUser.id }),
        supabase.rpc('increment_followers_count', { user_id: followingUser.id }),
      ]);

      return reply.send({
        success: true,
        data: newFollow,
      });
    } catch (error: any) {
      const authResponse = handleAuthError(reply, error);
      if (authResponse) return authResponse;
      logger.error('users/follows', 'Error in POST', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  app.delete('/users/:walletAddress/follows', async (request, reply) => {
    try {
      const { walletAddress } = request.params as { walletAddress: string };
      const query = request.query as Record<string, string | undefined>;
      const followingWalletAddress = query.followingWalletAddress;

      if (!walletAddress || !followingWalletAddress) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Both wallet addresses are required' },
        });
      }

      const supabase = createServerClient();

      // SECURITY FIX: Require authentication and verify wallet ownership
      const auth = await getAuthContext({ request, supabase });
      if (auth.walletAddress !== walletAddress) {
        return reply.code(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Wallet address mismatch' },
        });
      }

      const { data: followerUser, error: followerError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', walletAddress)
        .single();

      if (followerError || !followerUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Follower user not found' },
        });
      }

      const { data: followingUser, error: followingError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', followingWalletAddress)
        .single();

      if (followingError || !followingUser) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Following user not found' },
        });
      }

      const { error: deleteError } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', followerUser.id)
        .eq('following_id', followingUser.id);

      if (deleteError) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: deleteError.message },
        });
      }

      await Promise.all([
        supabase.rpc('decrement_following_count', { user_id: followerUser.id }),
        supabase.rpc('decrement_followers_count', { user_id: followingUser.id }),
      ]);

      return reply.send({
        success: true,
        data: {
          message: 'Unfollowed successfully',
        },
      });
    } catch (error: any) {
      const authResponse = handleAuthError(reply, error);
      if (authResponse) return authResponse;
      logger.error('users/follows', 'Error in DELETE', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
