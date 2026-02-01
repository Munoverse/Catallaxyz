/**
 * Environment Variables Check Script
 * 
 * Validates all required environment variables are set
 */

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const envVars: EnvVar[] = [
  {
    name: 'NEXT_PUBLIC_SOLANA_NETWORK',
    required: true,
    description: 'Solana network (devnet/mainnet-beta)',
  },
  {
    name: 'NEXT_PUBLIC_SOLANA_RPC_URL',
    required: true,
    description: 'Solana RPC endpoint',
  },
  {
    name: 'NEXT_PUBLIC_PROGRAM_ID',
    required: true,
    description: 'catallaxyz program ID',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    required: true,
    description: 'Supabase project URL',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: true,
    description: 'Supabase anonymous key',
  },
  {
    name: 'NEXT_PUBLIC_PRIVY_APP_ID',
    required: true,
    description: 'Privy application ID',
  },
  {
    name: 'NEXT_PUBLIC_USDC_MINT_ADDRESS',
    required: false,
    description: 'USDC mint address (optional, has default)',
  },
];

function main() {
  console.log('=== Environment Variables Check ===\n');

  let allValid = true;
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const envVar of envVars) {
    const value = process.env[envVar.name];
    
    if (envVar.required && !value) {
      missing.push(envVar.name);
      allValid = false;
      console.log(`✗ ${envVar.name}: MISSING (Required)`);
    } else if (value) {
      // Validate format for specific variables
      if (envVar.name === 'NEXT_PUBLIC_SOLANA_NETWORK') {
        if (!['devnet', 'mainnet-beta', 'localnet'].includes(value)) {
          invalid.push(envVar.name);
          allValid = false;
          console.log(`✗ ${envVar.name}: INVALID (Expected: devnet/mainnet-beta/localnet)`);
        } else {
          console.log(`✓ ${envVar.name}: ${value}`);
        }
      } else if (envVar.name === 'NEXT_PUBLIC_SOLANA_RPC_URL') {
        if (!value.startsWith('http')) {
          invalid.push(envVar.name);
          allValid = false;
          console.log(`✗ ${envVar.name}: INVALID (Must be a valid URL)`);
        } else {
          console.log(`✓ ${envVar.name}: ${value.substring(0, 50)}...`);
        }
      } else if (envVar.name === 'NEXT_PUBLIC_SUPABASE_URL') {
        if (!value.startsWith('http')) {
          invalid.push(envVar.name);
          allValid = false;
          console.log(`✗ ${envVar.name}: INVALID (Must be a valid URL)`);
        } else {
          console.log(`✓ ${envVar.name}: ${value.substring(0, 50)}...`);
        }
      } else {
        console.log(`✓ ${envVar.name}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
      }
    } else {
      console.log(`○ ${envVar.name}: Not set (Optional)`);
    }
  }

  console.log('\n=== Summary ===');
  
  if (allValid) {
    console.log('✓ All required environment variables are set correctly!');
    process.exit(0);
  } else {
    if (missing.length > 0) {
      console.log(`\nMissing required variables (${missing.length}):`);
      missing.forEach(name => console.log(`  - ${name}`));
    }
    if (invalid.length > 0) {
      console.log(`\nInvalid variables (${invalid.length}):`);
      invalid.forEach(name => console.log(`  - ${name}`));
    }
    console.log('\nPlease check your .env.local file and ensure all required variables are set.');
    process.exit(1);
  }
}

main();
