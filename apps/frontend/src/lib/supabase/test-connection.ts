/**
 * Supabase Connection Test Utility
 * 
 * This module provides functions to test Supabase connection and configuration
 */

import { supabase } from '../supabase';

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    url?: string;
    hasAnonKey: boolean;
    canConnect: boolean;
    canQuery: boolean;
    error?: string;
  };
}

/**
 * Test Supabase connection and configuration
 * @returns Test result with details
 */
export async function testSupabaseConnection(): Promise<ConnectionTestResult> {
  const result: ConnectionTestResult = {
    success: false,
    message: '',
    details: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      canConnect: false,
      canQuery: false,
    },
  };

  try {
    // Check environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || url === '' || url === 'https://placeholder.supabase.co') {
      result.message = '❌ NEXT_PUBLIC_SUPABASE_URL is not set or is placeholder';
      result.details!.error = 'Missing Supabase URL';
      return result;
    }

    if (!anonKey || anonKey === '' || anonKey === 'placeholder-key') {
      result.message = '❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is not set or is placeholder';
      result.details!.error = 'Missing Supabase Anon Key';
      return result;
    }

    result.details!.url = url;
    result.details!.hasAnonKey = true;

    // Test connection by querying a simple table
    // Try to query the users table (it should exist if schema is set up)
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      // If table doesn't exist, that's okay - connection works but schema might not be set up
      if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
        result.message = '⚠️ Connection successful, but schema might not be set up yet';
        result.details!.canConnect = true;
        result.details!.canQuery = false;
        result.details!.error = `Table 'users' not found. Please run the schema.sql file in Supabase SQL Editor.`;
        return result;
      }
      
      // Other errors indicate connection issues
      result.message = `❌ Connection failed: ${error.message}`;
      result.details!.error = error.message;
      return result;
    }

    // Success!
    result.success = true;
    result.message = '✅ Supabase connection successful!';
    result.details!.canConnect = true;
    result.details!.canQuery = true;

    return result;
  } catch (error: any) {
    result.message = `❌ Connection test failed: ${error.message}`;
    result.details!.error = error.message;
    return result;
  }
}

/**
 * Test if a specific table exists
 * @param tableName Table name to check
 * @returns true if table exists
 */
export async function testTableExists(tableName: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(tableName)
      .select('*')
      .limit(0);

    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
        return false;
      }
      throw error;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get list of required tables and check if they exist
 * @returns Object with table existence status
 */
export async function checkRequiredTables(): Promise<Record<string, boolean>> {
  const requiredTables = [
    'users',
    'markets',
    'market_settlements',
    'orders',
    'comments',
    'market_stats',
  ];

  const results: Record<string, boolean> = {};

  for (const table of requiredTables) {
    results[table] = await testTableExists(table);
  }

  return results;
}

/**
 * Comprehensive database health check
 * @returns Detailed health check result
 */
export async function healthCheck(): Promise<{
  connection: ConnectionTestResult;
  tables: Record<string, boolean>;
  allTablesExist: boolean;
  summary: string;
}> {
  const connection = await testSupabaseConnection();
  const tables = await checkRequiredTables();
  const allTablesExist = Object.values(tables).every(exists => exists);

  let summary = '';
  if (connection.success && allTablesExist) {
    summary = '✅ Database is fully configured and ready!';
  } else if (connection.success && !allTablesExist) {
    const missingTables = Object.entries(tables)
      .filter(([_, exists]) => !exists)
      .map(([name]) => name);
    summary = `⚠️ Connection works, but some tables are missing: ${missingTables.join(', ')}`;
  } else {
    summary = `❌ Connection failed: ${connection.message}`;
  }

  return {
    connection,
    tables,
    allTablesExist,
    summary,
  };
}

