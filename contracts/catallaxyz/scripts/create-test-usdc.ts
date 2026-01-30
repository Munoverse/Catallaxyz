import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import { getConnection, loadWallet, getAnchorConfig, printConfig } from "./utils/anchor-config.js";

/**
 * Create test USDC token on devnet
 * This script will:
 * 1. Create a new SPL Token (simulating USDC)
 * 2. Create associated token account for your wallet
 * 3. Mint test tokens to your account
 */

async function main() {
  // Setup from Anchor.toml
  printConfig();
  const config = getAnchorConfig();
  const connection = getConnection();
  const payer = loadWallet(config.walletPath);

  console.log("🔑 Payer:", payer.publicKey.toString());

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log("💰 SOL Balance:", balance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

  if (balance < 0.1 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Insufficient balance! Please request devnet SOL first:");
    console.log("   solana airdrop 2");
    console.log("   or visit: https://faucet.solana.com");
    return;
  }

  console.log("\n📦 Creating test USDC token...");

  // Create Token Mint (6 decimals, same as real USDC)
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    null, // freeze authority (null means cannot freeze)
    6, // 6 decimals (same as real USDC)
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );

  console.log("✅ Test USDC Mint Address:", mint.toString());

  // Create associated token account
  console.log("\n🏦 Creating token account...");
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );

  console.log("✅ Token Account Address:", tokenAccount.address.toString());

  // Mint test USDC (mint 10,000 USDC)
  const mintAmount = 10_000 * 1_000_000; // 10,000 USDC (6 decimals)
  console.log("\n💵 Minting test USDC...");
  const signature = await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer,
    mintAmount
  );

  console.log("✅ Minting successful! Signature:", signature);
  console.log("💰 Balance:", mintAmount / 1_000_000, "test USDC");

  // Save configuration info
  const config = {
    network: "devnet",
    testUsdcMint: mint.toString(),
    decimals: 6,
    owner: payer.publicKey.toString(),
    tokenAccount: tokenAccount.address.toString(),
    balance: mintAmount / 1_000_000,
    createdAt: new Date().toISOString(),
  };

  const configPath = "test-usdc-config.json";
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("\n📝 Configuration saved to:", configPath);

  console.log("\n" + "=".repeat(60));
  console.log("✨ Setup complete!");
  console.log("=".repeat(60));
  console.log("\n📋 Usage Instructions:");
  console.log("1. Update your test files to use this USDC mint address:");
  console.log(`   ${mint.toString()}`);
  console.log("\n2. If you need more test USDC, run:");
  console.log("   yarn mint-test-usdc <amount>");
  console.log("\n3. Check balance:");
  console.log("   spl-token balance " + mint.toString());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });

