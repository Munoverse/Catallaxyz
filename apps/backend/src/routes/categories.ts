import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createServerClient } from '../lib/supabase.js';
import { buildCacheKey, getCache, setCache, clearCachePrefix } from '../lib/cache.js';
import { getWalletAuthHeaders, verifyWalletAuth } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

const CATEGORIES_CACHE_TTL_MS = 60_000; // 1 minute cache

function getAdminAddress() {
  return process.env.ADMIN_WALLET_ADDRESS || '';
}

function isAdmin(walletAddress: string | undefined | null) {
  const adminAddress = getAdminAddress();
  if (!adminAddress || !walletAddress) return false;
  return adminAddress === walletAddress;
}

/**
 * SECURITY: Verify admin authentication with wallet signature
 */
async function requireAdminAuth(request: FastifyRequest) {
  const walletHeaders = getWalletAuthHeaders(request);
  // Also support legacy x-admin-* headers
  const address =
    (request.headers['x-admin-wallet'] as string | undefined) || walletHeaders.address;
  const signature =
    (request.headers['x-admin-signature'] as string | undefined) || walletHeaders.signature;
  const timestamp =
    (request.headers['x-admin-timestamp'] as string | undefined) || walletHeaders.timestamp;
  const nonce = (request.headers['x-admin-nonce'] as string | undefined) || walletHeaders.nonce;

  if (!address || !signature || !timestamp || !nonce) {
    const err = new Error('Missing admin auth headers');
    (err as any).statusCode = 401;
    throw err;
  }

  if (!isAdmin(address)) {
    const err = new Error('Unauthorized');
    (err as any).statusCode = 401;
    throw err;
  }

  const supabase = createServerClient();
  await verifyWalletAuth({
    supabase,
    walletAddress: address,
    signature,
    timestamp,
    nonce,
  });

  return address;
}

export default async function categoriesRoutes(app: FastifyInstance) {
  // Get all active categories (public)
  app.get('/categories', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const includeInactive = query.includeInactive === 'true';
      const withStats = query.withStats === 'true';

      const cacheKey = buildCacheKey('categories:list', {
        includeInactive,
        withStats,
      });
      
      const cached = getCache(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      const supabase = createServerClient();
      
      let dbQuery;
      if (withStats) {
        // Use the view that includes stats
        dbQuery = supabase
          .from('category_stats')
          .select('*')
          .order('display_order', { ascending: true });
      } else {
        dbQuery = supabase
          .from('categories')
          .select('*')
          .order('display_order', { ascending: true });
        
        if (!includeInactive) {
          dbQuery = dbQuery.eq('is_active', true);
        }
      }

      const { data: categories, error } = await dbQuery;

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      const response = {
        success: true,
        data: categories || [],
      };

      setCache(cacheKey, response, CATEGORIES_CACHE_TTL_MS);
      return reply.send(response);
    } catch (error: any) {
      logger.error('categories', 'Error in GET /api/categories', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Get single category by slug
  app.get('/categories/:slug', async (request, reply) => {
    try {
      const { slug } = request.params as { slug: string };
      const supabase = createServerClient();

      const { data: category, error } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error || !category) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Category not found' },
        });
      }

      return reply.send({
        success: true,
        data: category,
      });
    } catch (error: any) {
      logger.error('categories', 'Error in GET /api/categories/:slug', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Admin: Create new category
  app.post('/admin/categories', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const body = request.body as Record<string, any>;
      const { slug, name, nameZh, description, icon, color, displayOrder, isActive, isFeatured } = body;

      if (!slug || !name) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'slug and name are required' },
        });
      }

      // Validate slug format
      if (!/^[a-z0-9_-]+$/.test(slug)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'slug must contain only lowercase letters, numbers, underscores, and hyphens' },
        });
      }

      const supabase = createServerClient();

      const { data: category, error } = await supabase
        .from('categories')
        .insert([{
          slug,
          name,
          name_zh: nameZh || null,
          description: description || null,
          icon: icon || null,
          color: color || null,
          display_order: displayOrder ?? 0,
          is_active: isActive ?? true,
          is_featured: isFeatured ?? false,
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return reply.code(409).send({
            success: false,
            error: { code: 'DUPLICATE', message: 'Category with this slug already exists' },
          });
        }
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      // Clear cache
      clearCachePrefix('categories:');

      return reply.send({
        success: true,
        data: category,
      });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      logger.error('categories', 'Error in POST /api/admin/categories', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Admin: Update category
  app.patch('/admin/categories/:id', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const { name, nameZh, description, icon, color, displayOrder, isActive, isFeatured } = body;

      const supabase = createServerClient();

      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (nameZh !== undefined) updateData.name_zh = nameZh;
      if (description !== undefined) updateData.description = description;
      if (icon !== undefined) updateData.icon = icon;
      if (color !== undefined) updateData.color = color;
      if (displayOrder !== undefined) updateData.display_order = displayOrder;
      if (isActive !== undefined) updateData.is_active = isActive;
      if (isFeatured !== undefined) updateData.is_featured = isFeatured;

      const { data: category, error } = await supabase
        .from('categories')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      if (!category) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Category not found' },
        });
      }

      // Clear cache
      clearCachePrefix('categories:');

      return reply.send({
        success: true,
        data: category,
      });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      logger.error('categories', 'Error in PATCH /api/admin/categories/:id', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Admin: Delete category
  app.delete('/admin/categories/:id', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const { id } = request.params as { id: string };
      const supabase = createServerClient();

      // Check if category has markets
      const { data: category } = await supabase
        .from('categories')
        .select('slug, markets_count')
        .eq('id', id)
        .single();

      if (!category) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Category not found' },
        });
      }

      if (category.markets_count > 0) {
        return reply.code(400).send({
          success: false,
          error: { 
            code: 'HAS_MARKETS', 
            message: `Cannot delete category with ${category.markets_count} markets. Please reassign markets first.` 
          },
        });
      }

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      // Clear cache
      clearCachePrefix('categories:');

      return reply.send({
        success: true,
        data: { deleted: true, id },
      });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      logger.error('categories', 'Error in DELETE /api/admin/categories/:id', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Admin: Get all categories (including inactive)
  app.get('/admin/categories', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const supabase = createServerClient();

      const { data: categories, error } = await supabase
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        return reply.code(500).send({
          success: false,
          error: { code: 'SERVER_ERROR', message: error.message },
        });
      }

      return reply.send({
        success: true,
        data: categories || [],
      });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      logger.error('categories', 'Error in GET /api/admin/categories', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });

  // Admin: Reorder categories
  app.post('/admin/categories/reorder', async (request, reply) => {
    try {
      await requireAdminAuth(request);
      const body = request.body as Record<string, any>;
      const { categoryIds } = body;

      if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'categoryIds array is required' },
        });
      }

      const supabase = createServerClient();

      // Update display_order for each category
      for (let i = 0; i < categoryIds.length; i++) {
        await supabase
          .from('categories')
          .update({ display_order: i + 1 })
          .eq('id', categoryIds[i]);
      }

      // Clear cache
      clearCachePrefix('categories:');

      return reply.send({
        success: true,
        data: { reordered: true },
      });
    } catch (error: any) {
      if (error?.statusCode === 401) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      logger.error('categories', 'Error in POST /api/admin/categories/reorder', error);
      return reply.code(500).send({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message },
      });
    }
  });
}
