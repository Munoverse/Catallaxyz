/**
 * Database Connection Test Script
 * 
 * Run this script to test Supabase connection from command line:
 * npx tsx scripts/test-db.ts
 * 
 * Or with ts-node:
 * ts-node scripts/test-db.ts
 */

// Load environment variables from .env files
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local first (takes precedence), then .env
const envLocalPath = path.join(process.cwd(), '.env.local');
const envPath = path.join(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import { testSupabaseConnection, checkRequiredTables, healthCheck } from '../src/lib/supabase/test-connection';

async function main() {
  console.log('🔍 Testing Supabase Connection...\n');

  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`  NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Not set'}`);
  console.log(`  NEXT_PUBLIC_SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log('');

  // Test connection
  console.log('🔌 Testing Connection...');
  const connectionResult = await testSupabaseConnection();
  console.log(`  ${connectionResult.message}`);
  if (connectionResult.details) {
    console.log(`  URL: ${connectionResult.details.url || 'N/A'}`);
    console.log(`  Has Anon Key: ${connectionResult.details.hasAnonKey ? '✅' : '❌'}`);
    console.log(`  Can Connect: ${connectionResult.details.canConnect ? '✅' : '❌'}`);
    console.log(`  Can Query: ${connectionResult.details.canQuery ? '✅' : '❌'}`);
    if (connectionResult.details.error) {
      console.log(`  Error: ${connectionResult.details.error}`);
    }
  }
  console.log('');

  // Check tables
  console.log('📊 Checking Required Tables...');
  const tables = await checkRequiredTables();
  const allTablesExist = Object.values(tables).every(exists => exists);
  for (const [table, exists] of Object.entries(tables)) {
    console.log(`  ${exists ? '✅' : '❌'} ${table}`);
  }
  console.log('');

  // Full health check
  console.log('🏥 Running Full Health Check...');
  const health = await healthCheck();
  console.log(`  ${health.summary}`);
  console.log('');

  // Final summary
  if (connectionResult.success && allTablesExist) {
    console.log('✅ Database is fully configured and ready!');
    process.exit(0);
  } else {
    console.log('⚠️  Database configuration needs attention.');
    if (!connectionResult.success) {
      console.log('   - Fix connection issues first');
    }
    if (!allTablesExist) {
      const missingTables = Object.entries(tables)
        .filter(([_, exists]) => !exists)
        .map(([name]) => name);
      console.log(`   - Missing tables: ${missingTables.join(', ')}`);
      console.log('   - Run schema.sql in Supabase SQL Editor');
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

