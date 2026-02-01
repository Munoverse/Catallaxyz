/**
 * Database Connection Diagnostic Script
 * 
 * This script provides detailed diagnostics for Supabase connection issues
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
const envLocalPath = path.join(process.cwd(), '.env.local');
const envPath = path.join(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 Database Connection Diagnostics\n');

// Check environment variables
console.log('1️⃣ Environment Variables:');
console.log(`   URL: ${supabaseUrl ? '✅ Set' : '❌ Not set'}`);
if (supabaseUrl) {
  console.log(`   URL Format: ${supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co') ? '✅ Valid' : '⚠️  Check format'}`);
  console.log(`   URL Preview: ${supabaseUrl.substring(0, 30)}...`);
}
console.log(`   Anon Key: ${supabaseKey ? '✅ Set' : '❌ Not set'}`);
if (supabaseKey) {
  console.log(`   Key Length: ${supabaseKey.length} characters (expected ~100+)`);
  console.log(`   Key Preview: ${supabaseKey.substring(0, 20)}...`);
}
console.log('');

// Test network connectivity
console.log('2️⃣ Network Connectivity Test:');
if (supabaseUrl) {
  try {
    const url = new URL(supabaseUrl);
    console.log(`   Testing connection to: ${url.hostname}`);
    
    // Simple fetch test
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey || '',
      },
      signal: controller.signal,
    })
      .then(response => {
        clearTimeout(timeoutId);
        if (response.ok || response.status === 401 || response.status === 404) {
          console.log('   ✅ Network connection successful');
          console.log(`   Status: ${response.status} ${response.statusText}`);
        } else {
          console.log(`   ⚠️  Connection returned: ${response.status} ${response.statusText}`);
        }
      })
      .catch(error => {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.log('   ❌ Connection timeout (5s)');
          console.log('   💡 This might indicate:');
          console.log('      - Network connectivity issues');
          console.log('      - Firewall blocking the connection');
          console.log('      - Supabase project is paused or deleted');
        } else {
          console.log(`   ❌ Connection failed: ${error.message}`);
          console.log('   💡 Possible causes:');
          console.log('      - Incorrect Supabase URL');
          console.log('      - Network connectivity issues');
          console.log('      - Supabase project is paused');
        }
      });
  } catch (error: any) {
    console.log(`   ❌ Invalid URL format: ${error.message}`);
  }
} else {
  console.log('   ⚠️  Cannot test - URL not set');
}

console.log('\n3️⃣ Recommendations:');
console.log('   📝 If connection fails:');
console.log('      1. Verify Supabase URL in Dashboard → Settings → API');
console.log('      2. Check if project is active (not paused)');
console.log('      3. Verify network connectivity');
console.log('      4. Check firewall/proxy settings');
console.log('');
console.log('   📝 If environment variables are missing:');
console.log('      1. Check .env file exists in frontend directory');
console.log('      2. Verify variable names start with NEXT_PUBLIC_');
console.log('      3. Restart dev server after changes');
console.log('');
console.log('   📝 Next steps:');
console.log('      - Run: npm run test:db (after fixing issues)');
console.log('      - Or use DatabaseConnectionTest component in your app');

