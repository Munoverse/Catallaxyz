/**
 * Geo IP Check Middleware
 * Basic geographic restriction based on IP address
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { createServerClient } from '../supabase.js';
import { logger } from '../logger.js';

// Default blocked countries (can be overridden via database)
const DEFAULT_BLOCKED_COUNTRIES = ['US', 'KP', 'IR', 'SY', 'CU'];

// In-memory cache for geo rules (refresh every 5 minutes)
let geoRulesCache: GeoRule[] | null = null;
let geoRulesCacheTime = 0;
const GEO_RULES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface GeoRule {
  id: string;
  ruleType: 'country_block' | 'country_allow' | 'ip_block' | 'ip_allow';
  value: string;
  enabled: boolean;
}

interface GeoLookupResult {
  country?: string;
  region?: string;
  city?: string;
  ip: string;
}

/**
 * Simple IP to country lookup
 * In production, use MaxMind GeoIP2 or similar service
 */
async function lookupIP(ip: string): Promise<GeoLookupResult> {
  // Skip lookup for localhost/private IPs
  if (isPrivateIP(ip)) {
    return { ip, country: 'LOCAL' };
  }

  // Try free IP geolocation API (rate limited, for development only)
  // In production, use MaxMind GeoIP2 database
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,regionName,city`);
    if (response.ok) {
      const data = await response.json();
      return {
        ip,
        country: data.countryCode,
        region: data.regionName,
        city: data.city,
      };
    }
  } catch (err) {
    logger.warn('geo', 'IP lookup failed', err);
  }

  return { ip };
}

/**
 * Check if IP is private/local
 */
function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  if (ip.startsWith('10.') ||
      ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') || ip.startsWith('172.20.') || ip.startsWith('172.21.') ||
      ip.startsWith('172.22.') || ip.startsWith('172.23.') || ip.startsWith('172.24.') ||
      ip.startsWith('172.25.') || ip.startsWith('172.26.') || ip.startsWith('172.27.') ||
      ip.startsWith('172.28.') || ip.startsWith('172.29.') || ip.startsWith('172.30.') ||
      ip.startsWith('172.31.') ||
      ip.startsWith('192.168.') ||
      ip === '127.0.0.1' ||
      ip === 'localhost' ||
      ip === '::1') {
    return true;
  }
  return false;
}

/**
 * Get geo rules from database (with caching)
 */
async function getGeoRules(): Promise<GeoRule[]> {
  const now = Date.now();
  if (geoRulesCache && now - geoRulesCacheTime < GEO_RULES_CACHE_TTL) {
    return geoRulesCache;
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('geo_rules')
      .select('*')
      .eq('enabled', true);

    if (error) {
      logger.error('geo', 'Failed to fetch geo rules', error);
      return [];
    }

    geoRulesCache = (data || []).map((r: any) => ({
      id: r.id,
      ruleType: r.rule_type,
      value: r.value,
      enabled: r.enabled,
    }));
    geoRulesCacheTime = now;

    return geoRulesCache;
  } catch (err) {
    logger.error('geo', 'Error fetching geo rules', err);
    return [];
  }
}

/**
 * Check if IP matches a CIDR pattern
 */
function matchesCIDR(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) {
    return ip === cidr;
  }

  const [range, bits] = cidr.split('/');
  const mask = parseInt(bits, 10);

  // Simple implementation for IPv4
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) {
    return false;
  }

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
  const maskNum = ~((1 << (32 - mask)) - 1);

  return (ipNum & maskNum) === (rangeNum & maskNum);
}

/**
 * Check if request should be blocked based on geo rules
 */
async function shouldBlockRequest(ip: string, geo: GeoLookupResult): Promise<{ blocked: boolean; reason?: string }> {
  const rules = await getGeoRules();

  // Check IP allow rules first (whitelist takes priority)
  const ipAllowRules = rules.filter(r => r.ruleType === 'ip_allow');
  for (const rule of ipAllowRules) {
    if (matchesCIDR(ip, rule.value)) {
      return { blocked: false };
    }
  }

  // Check IP block rules
  const ipBlockRules = rules.filter(r => r.ruleType === 'ip_block');
  for (const rule of ipBlockRules) {
    if (matchesCIDR(ip, rule.value)) {
      return { blocked: true, reason: `IP blocked: ${ip}` };
    }
  }

  // Check country rules
  if (geo.country) {
    // Check country allow rules
    const countryAllowRules = rules.filter(r => r.ruleType === 'country_allow');
    if (countryAllowRules.length > 0) {
      // If allow rules exist, only allow listed countries
      const allowed = countryAllowRules.some(r => r.value === geo.country);
      if (!allowed) {
        return { blocked: true, reason: `Country not in allow list: ${geo.country}` };
      }
    }

    // Check country block rules
    const countryBlockRules = rules.filter(r => r.ruleType === 'country_block');
    for (const rule of countryBlockRules) {
      if (rule.value === geo.country) {
        return { blocked: true, reason: `Country blocked: ${geo.country}` };
      }
    }

    // Check default blocked countries if no database rules
    if (rules.length === 0 && DEFAULT_BLOCKED_COUNTRIES.includes(geo.country)) {
      return { blocked: true, reason: `Country blocked: ${geo.country}` };
    }
  }

  return { blocked: false };
}

/**
 * Get client IP from request
 */
function getClientIP(request: FastifyRequest): string {
  // Check X-Forwarded-For header (when behind load balancer/proxy)
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = (typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0]).split(',');
    return ips[0].trim();
  }

  // Check X-Real-IP header
  const realIP = request.headers['x-real-ip'];
  if (realIP) {
    return typeof realIP === 'string' ? realIP : realIP[0];
  }

  // Fallback to socket address
  return request.ip || '127.0.0.1';
}

/**
 * Geo check middleware for Fastify
 */
export async function geoCheckMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const ip = getClientIP(request);

  // Skip check for private IPs
  if (isPrivateIP(ip)) {
    return;
  }

  // Lookup IP location
  const geo = await lookupIP(ip);

  // Check if blocked
  const { blocked, reason } = await shouldBlockRequest(ip, geo);

  if (blocked) {
    logger.info('geo', `Geo block: Country=${geo.country}, Reason=${reason}`);
    return reply.code(451).send({
      success: false,
      error: {
        code: 'GEO_RESTRICTED',
        message: 'Service unavailable in your region',
      },
    });
  }
}

/**
 * Clear geo rules cache (call when rules are updated)
 */
export function clearGeoRulesCache(): void {
  geoRulesCache = null;
  geoRulesCacheTime = 0;
}

/**
 * Get current geo rules (for admin display)
 */
export async function listGeoRules(): Promise<GeoRule[]> {
  return getGeoRules();
}
