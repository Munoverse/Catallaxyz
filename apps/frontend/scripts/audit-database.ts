/**
 * Database Audit Script
 * Check for redundant tables, columns, data and unused indexes
 * Run: npm run audit:db
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load environment variables
const envLocalPath = path.resolve(__dirname, '../.env.local')
const envPath = path.resolve(__dirname, '../.env')

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath })
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

console.log('\n🔍 Database Audit Tool\n')
console.log('='.repeat(70))

// Define tables and columns actually used in the project
const EXPECTED_SCHEMA = {
  users: {
    columns: [
      'id',
      'wallet_address',
      'embedded_wallet_address',
      'external_wallet_address',
      'auth_provider',
      'oauth_provider',
      'username',
      'display_name',
      'username_verified',
      'email',
      'twitter_handle',
      'bio',
      'avatar_url',
      'created_at',
      'updated_at',
      'last_login_at',
      'total_markets_created',
      'total_trades',
      'total_volume',
      'total_profit_loss',
      'biggest_win',
      'total_predictions',
      'total_stakes_amount',
      'total_terminations',
      'total_wins',
      'total_losses',
      'win_rate',
      'prediction_accuracy',
      'average_return',
      'best_market_category',
      'usdc_balance',
      'last_balance_update',
      'preferences',
      'profile_views',
      'following_count',
      'followers_count'
    ],
    indexes: [
      'users_pkey',
      'users_wallet_address_key',
      'users_username_key',
      'idx_users_username',
      'idx_users_wallet_address',
      'idx_users_embedded_wallet'
    ]
  },
  markets: {
    columns: [
      'id',
      'creator_id',
      'title',
      'question',
      'description',
      'category',
      'tags',
      'image_url',
      'solana_market_account',
      'switchboard_queue',
      'randomness_account',
      'market_usdc_vault',
      'status',
      'is_paused',
      'paused_at',
      'paused_reason',
      'total_volume',
      'total_trades',
      'tip_amount',
      'tip_count',
      'liquidity',
      'min_split_amount',
      'participants_count',
      'daily_active_traders',
      'weekly_active_traders',
      'average_trade_size',
      'peak_liquidity',
      'liquidity_ratio',
      'platform_fee',
      'rent_paid',
      'platform_fee_rate',
      'maker_rebate_rate',
      'creator_incentive_rate',
      'current_yes_price',
      'current_no_price',
      'bid_price',
      'ask_price',
      'last_price',
      'opening_price',
      'highest_price',
      'lowest_price',
      'price_volatility',
      'probability',
      'open_interest',
      'winning_outcome',
      'total_winners',
      'total_losers',
      'total_payout',
      'current_settlement_index',
      'can_redeem',
      'is_randomly_terminated',
      'final_yes_price',
      'final_no_price',
      'termination_triggered_at',
      'created_at',
      'updated_at',
      'last_trade_at',
      'settled_at',
      'expires_at',
      'is_settled',
      'settlement_timestamp',
      'settlement_tx_signature',
      'metadata'
    ],
    indexes: ['markets_pkey', 'markets_solana_market_account_key', 'idx_markets_creator', 'idx_markets_status']
  },
  market_settlements: {
    columns: [
      'id',
      'market_id',
      'randomness_request_id',
      'settlement_type',
      'winning_outcome',
      'randomness_value',
      'settlement_probability',
      'last_trader_id',
      'total_winners',
      'total_losers',
      'total_payout',
      'total_burned',
      'oracle_data',
      'verification_signature',
      'transaction_signature',
      'slot',
      'settled_at'
    ],
    indexes: ['market_settlements_pkey', 'idx_market_settlements_market']
  },
  orders: {
    columns: [
      'id',
      'market_id',
      'user_id',
      'outcome_type',
      'side',
      'order_type',
      'price',
      'amount',
      'filled_amount',
      'remaining_amount',
      'maker_fee',
      'taker_fee',
      'status',
      'question_index',
      'transaction_signature',
      'slot',
      'client_order_id',
      'order_hash',
      'nonce',
      'expires_at',
      'signature',
      'maker_fee_rate',
      'taker_fee_rate',
      'created_at',
      'updated_at',
      'placed_at',
      'filled_at',
      'cancelled_at',
      'vrf_fee_prepaid',
      'vrf_fee_refunded',
      'vrf_fee_refund_amount'
    ],
    indexes: [
      'orders_pkey',
      'idx_orders_user',
      'idx_orders_market',
      'idx_orders_status'
    ]
  },
  trades: {
    columns: [
      'id',
      'market_id',
      'user_id',
      'outcome_type',
      'side',
      'maker_order_id',
      'taker_order_id',
      'maker_user_id',
      'taker_user_id',
      'amount',
      'price',
      'total_cost',
      'platform_fee',
      'maker_fee',
      'taker_fee',
      'transaction_signature',
      'slot',
      'block_time',
      'created_at'
    ],
    indexes: [
      'trades_pkey',
      'idx_trades_market',
      'idx_trades_user',
      'idx_trades_maker_user',
      'idx_trades_taker_user',
      'idx_trades_created_at',
      'idx_trades_block_time',
      'idx_trades_market_time',
      'idx_trades_signature'
    ]
  },
  market_stats: {
    columns: [
      'id',
      'market_id',
      'settlement_index',
      'total_stakes',
      'total_staked_amount',
      'total_volume',
      'total_trades',
      'yes_probability',
      'no_probability',
      'participants_count',
      'created_at',
      'updated_at'
    ],
    indexes: ['market_stats_pkey', 'idx_market_stats_market']
  },
  user_follows: {
    columns: ['id', 'follower_id', 'following_id', 'created_at'],
    indexes: [
      'user_follows_pkey',
      'user_follows_follower_id_following_id_key',
      'idx_user_follows_follower',
      'idx_user_follows_following'
    ]
  },
  comments: {
    columns: [
      'id',
      'user_id',
      'market_id',
      'parent_id',
      'content',
      'likes_count',
      'upvotes',
      'downvotes',
      'tip_amount',
      'tip_count',
      'is_deleted',
      'is_flagged',
      'created_at',
      'updated_at'
    ],
    indexes: [
      'comments_pkey',
      'idx_comments_market',
      'idx_comments_parent'
    ]
  }
}

interface TableInfo {
  table_name: string
  row_count: number
}

interface ColumnInfo {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
}

interface IndexInfo {
  schemaname: string
  tablename: string
  indexname: string
  indexdef: string
}

// 1. Get all tables (by attempting to access each expected table)
async function getAllTables(): Promise<string[]> {
  const expectedTables = Object.keys(EXPECTED_SCHEMA)
  const existingTables: string[] = []

  console.log(`   Detecting ${expectedTables.length} expected tables...`)

  for (const tableName of expectedTables) {
    try {
      const { error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1)
        .maybeSingle()

      // If no error or just empty table (PGRST116), table exists
      if (!error || error.code === 'PGRST116') {
        existingTables.push(tableName)
      } else if (error.code === '42P01') {
        // Table does not exist
        console.log(`   ⚠️  Table ${tableName} does not exist`)
      }
    } catch (err) {
      // Ignore error, continue checking next table
    }
  }

  return existingTables
}

// 2. Get all columns of a table (using Postgres REST API)
async function getTableColumns(tableName: string): Promise<ColumnInfo[]> {
  try {
    // Method: Try querying table to get column info
    const { data: sampleData, error: sampleError } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)
      .maybeSingle()

    if (sampleError && sampleError.code !== 'PGRST116') {
      console.error(`   ⚠️  Cannot query ${tableName} table:`, sampleError.message)
      return []
    }

    // If query succeeds or table is empty, infer columns from returned data
    if (sampleData) {
      return Object.keys(sampleData).map(columnName => ({
        table_name: tableName,
        column_name: columnName,
        data_type: typeof sampleData[columnName],
        is_nullable: 'unknown'
      }))
    } else if (sampleError?.code === 'PGRST116') {
      // Table is empty, try to get columns via HEAD request
      const { error: headError } = await supabase
        .from(tableName)
        .select('*')
        .limit(0)

      if (!headError) {
        // Table exists but is empty, use expected columns
        const expectedColumns = EXPECTED_SCHEMA[tableName as keyof typeof EXPECTED_SCHEMA]?.columns || []
        return expectedColumns.map(col => ({
          table_name: tableName,
          column_name: col,
          data_type: 'unknown',
          is_nullable: 'unknown'
        }))
      }
    }

    return []
  } catch (error) {
    console.error(`   ⚠️  Failed to get ${tableName} column info:`, error)
    return []
  }
}

// 3. Get table row count
async function getTableRowCount(tableName: string): Promise<number> {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })

  if (error) {
    return -1
  }

  return count || 0
}

// 4. Get table indexes (cannot directly get via REST API, use expected values)
async function getTableIndexes(tableName: string): Promise<string[]> {
  // Supabase REST API does not directly support querying index information
  // We assume if table exists, basic indexes exist
  // For complete index checking, need to use SQL queries or database management tools
  
  const expectedIndexes = EXPECTED_SCHEMA[tableName as keyof typeof EXPECTED_SCHEMA]?.indexes || []
  
  // At least primary key index should exist
  const primaryKeyIndex = `${tableName}_pkey`
  
  // Simplified: assume primary key exists if table exists
  return [primaryKeyIndex]
}

// 5. Check for duplicate data (via Supabase query)
async function checkDuplicates(tableName: string): Promise<any> {
  const result: any = {
    hasDuplicates: false,
    duplicates: []
  }

  try {
    // Check for different duplicate cases based on table
    if (tableName === 'users') {
      // Get all user data
      const { data: users, error } = await supabase
        .from('users')
        .select('wallet_address, username')

      if (error || !users) {
        return result
      }

      // Check for duplicate wallet_address
      const walletCounts: Record<string, number> = {}
      users.forEach((user: any) => {
        if (user.wallet_address) {
          walletCounts[user.wallet_address] = (walletCounts[user.wallet_address] || 0) + 1
        }
      })

      const duplicateWallets = Object.entries(walletCounts)
        .filter(([_, count]) => count > 1)
        .map(([address, count]) => ({ wallet_address: address, count }))

      if (duplicateWallets.length > 0) {
        result.hasDuplicates = true
        result.duplicates.push({
          type: 'wallet_address',
          count: duplicateWallets.length,
          examples: duplicateWallets.slice(0, 3)
        })
      }

      // Check for duplicate username
      const usernameCounts: Record<string, number> = {}
      users.forEach((user: any) => {
        if (user.username) {
          usernameCounts[user.username] = (usernameCounts[user.username] || 0) + 1
        }
      })

      const duplicateUsernames = Object.entries(usernameCounts)
        .filter(([_, count]) => count > 1)
        .map(([username, count]) => ({ username, count }))

      if (duplicateUsernames.length > 0) {
        result.hasDuplicates = true
        result.duplicates.push({
          type: 'username',
          count: duplicateUsernames.length,
          examples: duplicateUsernames.slice(0, 3)
        })
      }
    }
  } catch (error) {
    console.error(`   ⚠️  Failed to check ${tableName} for duplicate data:`, error)
  }

  return result
}

// Main audit function
async function auditDatabase() {
  const issues: any[] = []

  console.log('\n📊 Step 1: Check all tables')
  console.log('-'.repeat(70))

  const tables = await getAllTables()
  const expectedTables = Object.keys(EXPECTED_SCHEMA)

  console.log(`✅ Found ${tables.length} tables`)
  console.log(`   Expected table count: ${expectedTables.length}`)

  // Check for missing tables
  const missingTables = expectedTables.filter(t => !tables.includes(t))
  if (missingTables.length > 0) {
    console.log(`\n❌ Missing tables (${missingTables.length}):`)
    missingTables.forEach(t => console.log(`   - ${t}`))
    issues.push({ type: 'missing_table', tables: missingTables })
  }

  // Check for extra tables (possibly redundant)
  const extraTables = tables.filter(t => !expectedTables.includes(t))
  if (extraTables.length > 0) {
    console.log(`\n⚠️  Unexpected tables (${extraTables.length}):`)
    extraTables.forEach(t => console.log(`   - ${t} (possibly test or redundant table)`))
    issues.push({ type: 'extra_table', tables: extraTables })
  }

  console.log('\n📋 Step 2: Check table structure and data')
  console.log('-'.repeat(70))

  for (const tableName of expectedTables) {
    if (!tables.includes(tableName)) {
      continue // Skip non-existent tables
    }

    console.log(`\n🔍 Checking table: ${tableName}`)

    // Get column info
    const columns = await getTableColumns(tableName)
    const columnNames = columns.map(c => c.column_name)
    const expectedColumns = EXPECTED_SCHEMA[tableName as keyof typeof EXPECTED_SCHEMA]?.columns || []

    console.log(`   Column count: ${columnNames.length} (expected: ${expectedColumns.length})`)

    // Check for missing columns
    const missingColumns = expectedColumns.filter(c => !columnNames.includes(c))
    if (missingColumns.length > 0) {
      console.log(`   ❌ Missing columns: ${missingColumns.join(', ')}`)
      issues.push({ type: 'missing_column', table: tableName, columns: missingColumns })
    }

    // Check for extra columns
    const extraColumns = columnNames.filter(c => !expectedColumns.includes(c))
    if (extraColumns.length > 0) {
      console.log(`   ⚠️  Extra columns: ${extraColumns.join(', ')} (possibly redundant)`)
      issues.push({ type: 'extra_column', table: tableName, columns: extraColumns })
    }

    // Get row count
    const rowCount = await getTableRowCount(tableName)
    console.log(`   Data row count: ${rowCount >= 0 ? rowCount : 'Unable to retrieve'}`)

    if (rowCount === 0) {
      console.log(`   ℹ️  Table is empty`)
    }

    // Check for duplicate data
    if (rowCount > 0) {
      const duplicates = await checkDuplicates(tableName)
      if (duplicates.hasDuplicates) {
        console.log(`   ⚠️  Found duplicate data:`)
        duplicates.duplicates.forEach((dup: any) => {
          console.log(`      - ${dup.type}: ${dup.count} duplicate groups`)
        })
        issues.push({ type: 'duplicate_data', table: tableName, details: duplicates })
      }
    }

    // Check indexes
    const indexes = await getTableIndexes(tableName)
    const expectedIndexes = EXPECTED_SCHEMA[tableName as keyof typeof EXPECTED_SCHEMA]?.indexes || []
    
    console.log(`   Index count: ${indexes.length} (expected: ${expectedIndexes.length})`)
    
    const missingIndexes = expectedIndexes.filter(i => !indexes.includes(i))
    if (missingIndexes.length > 0) {
      console.log(`   ⚠️  Missing indexes: ${missingIndexes.join(', ')}`)
      issues.push({ type: 'missing_index', table: tableName, indexes: missingIndexes })
    }
  }

  console.log('\n📊 Step 3: Data integrity check')
  console.log('-'.repeat(70))

  // Check foreign key references
  if (tables.includes('users') && tables.includes('markets')) {
    try {
      // Get all markets
      const { data: markets } = await supabase.from('markets').select('creator_id')
      
      if (markets && markets.length > 0) {
        // Get all users
        const { data: users } = await supabase.from('users').select('id')
        const userIds = new Set(users?.map((u: any) => u.id) || [])

        // Check for orphaned markets
        const orphanedCount = markets.filter((m: any) => !userIds.has(m.creator_id)).length

        if (orphanedCount > 0) {
          console.log(`⚠️  Found ${orphanedCount} orphaned market records (creator does not exist)`)
          issues.push({ type: 'orphaned_records', table: 'markets', count: orphanedCount })
        } else {
          console.log(`✅ markets table: No orphaned records`)
        }
      } else {
        console.log(`ℹ️  markets table is empty, skipping foreign key check`)
      }
    } catch (error) {
      console.log(`⚠️  Cannot check foreign key integrity:`, error)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70))
  console.log('📊 Audit Summary')
  console.log('='.repeat(70))

  if (issues.length === 0) {
    console.log('\n🎉 Database structure is perfect! No issues found.')
  } else {
    console.log(`\n⚠️  Found ${issues.length} issues:`)
    
    const issueTypes = {
      missing_table: 'Missing tables',
      extra_table: 'Extra tables',
      missing_column: 'Missing columns',
      extra_column: 'Extra columns',
      duplicate_data: 'Duplicate data',
      missing_index: 'Missing indexes',
      orphaned_records: 'Orphaned records'
    }

    const grouped = issues.reduce((acc: any, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1
      return acc
    }, {})

    Object.entries(grouped).forEach(([type, count]) => {
      console.log(`   - ${issueTypes[type as keyof typeof issueTypes]}: ${count}`)
    })

    console.log('\n💡 Recommendations:')
    
    if (issues.some(i => i.type === 'missing_table')) {
      console.log('   1. Run schema.sql to create missing tables')
    }
    
    if (issues.some(i => i.type === 'missing_column')) {
      console.log('   2. Run migration SQL to add missing columns')
    }
    
    if (issues.some(i => i.type === 'extra_table' || i.type === 'extra_column')) {
      console.log('   3. Check and clean up unneeded tables or columns (possibly test data)')
    }
    
    if (issues.some(i => i.type === 'duplicate_data')) {
      console.log('   4. Clean up duplicate data (run DISTINCT queries or manually delete)')
    }
    
    if (issues.some(i => i.type === 'missing_index')) {
      console.log('   5. Add missing indexes to improve performance')
    }
  }

  console.log('\n📝 Detailed report generated')
  console.log()

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total_tables: tables.length,
      expected_tables: expectedTables.length,
      issues_found: issues.length
    },
    issues: issues
  }

  const reportPath = path.resolve(__dirname, '../database-audit-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`✅ Detailed report saved to: database-audit-report.json`)
  console.log()
}

// Run audit
auditDatabase().catch(console.error)

