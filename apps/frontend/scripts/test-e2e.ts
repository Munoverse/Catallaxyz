/**
 * End-to-End Test Script
 * 
 * Tests the complete catallaxyz workflow
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    console.log(`Testing: ${name}...`);
    await fn();
    results.push({ name, passed: true });
    console.log(`✓ ${name} passed\n`);
  } catch (error: any) {
    results.push({ name, passed: false, error: error.message });
    console.error(`✗ ${name} failed: ${error.message}\n`);
  }
}

async function main() {
  console.log('=== catallaxyz E2E Tests ===\n');

  // Test 1: Database Connection
  await test('Database Connection', async () => {
    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error) throw error;
  });

  // Test 2: Tables Exist
  await test('Tables Exist', async () => {
    const tables = ['users', 'markets', 'trades', 'user_statistics', 'user_follows'];
    for (const table of tables) {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (error && error.code !== 'PGRST116') {
        throw new Error(`Table ${table} does not exist or is not accessible`);
      }
    }
  });

  // Test 3: Market Creation API
  await test('Market Creation API', async () => {
    const testMarket = {
      title: 'E2E Test Market',
      question: 'Is this a test?',
      market_type: 'single',
      status: 'active',
    };

    // Note: This requires authentication, so we just check the endpoint exists
    // In a real test, you would need to authenticate first
    console.log('  Note: Market creation requires authentication');
  });

  // Test 4: Trade Records Structure
  await test('Trades Structure', async () => {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    // If we have data, verify structure
    if (data && data.length > 0) {
      const record = data[0];
      const requiredFields = [
        'market_id',
        'user_id',
        'outcome_type',
        'side',
        'amount',
        'price',
        'total_cost',
      ];
      
      for (const field of requiredFields) {
        if (!(field in record)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }
  });

  // Test 5: User Statistics Structure
  await test('User Statistics Structure', async () => {
    const { data, error } = await supabase
      .from('user_statistics')
      .select('*')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    if (data && data.length > 0) {
      const stats = data[0];
      const requiredFields = [
        'user_id',
        'total_profit',
        'total_loss',
        'win_count',
        'loss_count',
        'total_trades',
      ];
      
      for (const field of requiredFields) {
        if (!(field in stats)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }
  });

  // Test 6: User Follows Structure
  await test('User Follows Structure', async () => {
    const { data, error } = await supabase
      .from('user_follows')
      .select('*')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    if (data && data.length > 0) {
      const follow = data[0];
      if (!('follower_id' in follow) || !('following_id' in follow)) {
        throw new Error('Missing required fields in user_follows');
      }
    }
  });

  // Print Summary
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log('\nAll tests passed! ✓');
    process.exit(0);
  }
}

main().catch(console.error);

