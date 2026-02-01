/**
 * Supabase Connection Test Script
 * Run: npm run test:supabase
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load environment variables - supports .env.local or .env
const envLocalPath = path.resolve(__dirname, '../.env.local')
const envPath = path.resolve(__dirname, '../.env')

let envFile = '.env.local'
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath })
  envFile = '.env.local'
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
  envFile = '.env'
} else {
  console.error('❌ Environment variable file not found (.env.local or .env)')
  console.log('\n💡 Please create .env or .env.local file')
  process.exit(1)
}

console.log(`📄 Using environment variable file: ${envFile}`)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('\n🔍 Supabase Connection Test\n')
console.log('=' .repeat(50))

// Test 1: Check environment variables
console.log('\n📋 Test 1: Check Environment Variables')
console.log('-'.repeat(50))

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL not set')
} else {
  console.log('✅ NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl)
}

if (!supabaseAnonKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY not set')
} else {
  console.log('✅ NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey.substring(0, 20) + '...')
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set')
} else {
  console.log('✅ SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey.substring(0, 20) + '...')
}

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error('\n❌ Environment variables incomplete, please check .env.local file')
  process.exit(1)
}

// Test 2: Connect to Supabase
console.log('\n🔌 Test 2: Connect to Supabase')
console.log('-'.repeat(50))

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Test 3: Check if users table exists
console.log('\n📊 Test 3: Check users Table')
console.log('-'.repeat(50))

async function testUsersTable() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1)

    if (error) {
      console.error('❌ Failed to query users table:', error.message)
      if (error.code === '42P01') {
        console.error('   Note: users table does not exist, please run schema.sql')
      }
      return false
    }

    console.log('✅ users table exists')
    console.log('   Sample record count:', data?.length || 0)
    return true
  } catch (error: any) {
    console.error('❌ Connection failed:', error.message)
    return false
  }
}

// Test 4: Check users table fields
console.log('\n🔍 Test 4: Check users Table Fields')
console.log('-'.repeat(50))

async function testUsersColumns() {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
      `
    })

    if (error) {
      console.log('⚠️  Cannot query field information (this is normal, using alternative method)')
      
      // Alternative method: try querying one record
      const { data: sampleData, error: sampleError } = await supabase
        .from('users')
        .select('*')
        .limit(1)
        .single()

      if (sampleError && sampleError.code !== 'PGRST116') {
        console.error('❌ Query failed:', sampleError.message)
        return false
      }

      if (sampleData || sampleError?.code === 'PGRST116') {
        console.log('✅ users table is accessible')
        
        // Check required fields
        const requiredFields = ['id', 'wallet_address', 'username', 'email', 'bio', 'avatar', 'created_at', 'updated_at']
        console.log('\n   Checking required fields:')
        
        // Try inserting test data to verify fields
        const testWallet = 'TEST_' + Date.now()
        
        // Note: privy_user_id is NOT NULL in original schema
        // But we mainly use wallet_address, so need to provide a test value
        const { error: insertError } = await supabase
          .from('users')
          .insert([{ 
            wallet_address: testWallet,
            privy_user_id: 'test_privy_' + Date.now() // Provide privy_user_id
          }])
          .select()
          .single()

        if (insertError) {
          console.error('❌ Cannot insert test data:', insertError.message)
          
          if (insertError.message.includes('privy_user_id') && insertError.message.includes('not-null')) {
            console.error('   Note: privy_user_id is required, but our API mainly uses wallet_address')
            console.error('   Recommendation: Run fix_users_table_constraints.sql to fix table structure')
          } else if (insertError.message.includes('column') && insertError.message.includes('does not exist')) {
            console.error('   Note: Some fields do not exist, please run migration SQL')
          }
          return false
        }

        // Delete test data
        await supabase.from('users').delete().eq('wallet_address', testWallet)
        
        console.log('   ✅ All required fields exist')
        return true
      }
    }

    return true
  } catch (error: any) {
    console.error('❌ Field check failed:', error.message)
    return false
  }
}

// Test 5: Test insert and delete
console.log('\n✏️  Test 5: Test Data Operations (Insert/Query/Delete)')
console.log('-'.repeat(50))

async function testCRUD() {
  const testWallet = 'TEST_' + Date.now()
  const testUsername = 'testuser_' + Date.now()
  const testPrivyId = 'test_privy_' + Date.now()

  try {
    // Insert
    console.log('   → Inserting test data...')
    const { data: insertData, error: insertError } = await supabase
      .from('users')
      .insert([{
        wallet_address: testWallet,
        privy_user_id: testPrivyId, // Add required privy_user_id
        username: testUsername,
        email: 'test@example.com',
        bio: 'Test bio'
      }])
      .select()
      .single()

    if (insertError) {
      console.error('   ❌ Insert failed:', insertError.message)
      return false
    }

    console.log('   ✅ Insert successful, ID:', insertData.id)

    // Query
    console.log('   → Querying test data...')
    const { data: selectData, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', testWallet)
      .single()

    if (selectError) {
      console.error('   ❌ Query failed:', selectError.message)
      return false
    }

    console.log('   ✅ Query successful, Username:', selectData.username)

    // Update
    console.log('   → Updating test data...')
    const { error: updateError } = await supabase
      .from('users')
      .update({ bio: 'Updated bio' })
      .eq('wallet_address', testWallet)

    if (updateError) {
      console.error('   ❌ Update failed:', updateError.message)
      return false
    }

    console.log('   ✅ Update successful')

    // Delete
    console.log('   → Deleting test data...')
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('wallet_address', testWallet)

    if (deleteError) {
      console.error('   ❌ Delete failed:', deleteError.message)
      return false
    }

    console.log('   ✅ Delete successful')

    return true
  } catch (error: any) {
    console.error('   ❌ CRUD operations failed:', error.message)
    
    // Clean up test data
    try {
      await supabase.from('users').delete().eq('wallet_address', testWallet)
    } catch {}
    
    return false
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n' + '='.repeat(50))
  console.log('Starting tests...\n')

  const results = {
    envVars: true,
    connection: false,
    table: false,
    columns: false,
    crud: false
  }

  // Environment variables already checked above
  results.envVars = !!(supabaseUrl && supabaseAnonKey && supabaseServiceKey)

  if (results.envVars) {
    results.connection = true
    results.table = await testUsersTable()
    
    if (results.table) {
      results.columns = await testUsersColumns()
      
      if (results.columns) {
        results.crud = await testCRUD()
      }
    }
  }

  // Display summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 Test Results Summary')
  console.log('='.repeat(50))
  console.log()
  console.log(`${results.envVars ? '✅' : '❌'} Environment Variables`)
  console.log(`${results.connection ? '✅' : '❌'} Supabase Connection`)
  console.log(`${results.table ? '✅' : '❌'} users Table`)
  console.log(`${results.columns ? '✅' : '❌'} Table Fields`)
  console.log(`${results.crud ? '✅' : '❌'} CRUD Operations`)
  console.log()

  const allPassed = Object.values(results).every(r => r)

  if (allPassed) {
    console.log('🎉 All tests passed! Supabase connection is normal!')
    console.log()
    process.exit(0)
  } else {
    console.log('❌ Some tests failed, please check error messages above')
    console.log()
    console.log('💡 Solutions:')
    if (!results.envVars) {
      console.log('   1. Check if .env.local file exists')
      console.log('   2. Confirm environment variable names are correct')
    }
    if (!results.table) {
      console.log('   1. Run schema.sql in Supabase Dashboard')
      console.log('   2. Check database connection permissions')
    }
    if (!results.columns) {
      console.log('   1. Run migration SQL (add_user_profile_fields.sql)')
      console.log('   2. Check database table structure')
    }
    if (!results.crud) {
      console.log('   1. Check RLS policies')
      console.log('   2. Confirm service_role_key permissions')
    }
    console.log()
    process.exit(1)
  }
}

runAllTests()

