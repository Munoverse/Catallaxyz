/**
 * Unified USDC Minting Script
 * AUDIT FIX v2.0.3: Consolidated mint-test-usdc.ts and mint-tusdc-to-user.ts
 * 
 * Usage:
 *   # Mint to yourself (mint authority)
 *   yarn mint-usdc 1000
 * 
 *   # Mint to a specific user
 *   yarn mint-usdc 1000 --to <wallet_address>
 * 
 * Examples:
 *   yarn mint-usdc 5000
 *   yarn mint-usdc 5000 --to 9p4sZ5ZdZQhjkUwp56aYaQXWVnXZNV5fTeZUpQgrYweN
 */

import * as anchor from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import { getConnection, loadWallet, getAnchorConfig, printConfig } from "./utils/anchor-config.js";

// Parse command line arguments
function parseArgs(): { amount: number; recipient?: string } {
  const args = process.argv.slice(2);
  let amount: number | null = null;
  let recipient: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--to' && args[i + 1]) {
      recipient = args[i + 1];
      i++;
    } else if (!isNaN(parseInt(args[i]))) {
      amount = parseInt(args[i]);
    }
  }

  if (amount === null || amount <= 0) {
    console.log("❌ Usage: yarn mint-usdc <amount> [--to <wallet_address>]");
    console.log("");
    console.log("Examples:");
    console.log("  yarn mint-usdc 1000           # Mint to yourself");
    console.log("  yarn mint-usdc 5000 --to ABC123...  # Mint to specific wallet");
    process.exit(1);
  }

  return { amount, recipient };
}

async function main() {
  const { amount, recipient } = parseArgs();

  // Read config
  const configPath = "test-usdc-config.json";
  if (!fs.existsSync(configPath)) {
    console.log("❌ Config file does not exist! Please run first: yarn create-test-usdc");
    process.exit(1);
  }

  const usdcConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const mintAddress = new PublicKey(usdcConfig.testUsdcMint);

  // Setup from Anchor.toml
  printConfig();
  const anchorConfig = getAnchorConfig();
  const connection = getConnection();
  const payer = loadWallet(anchorConfig.walletPath);

  // Determine recipient
  const recipientAddress = recipient 
    ? new PublicKey(recipient) 
    : payer.publicKey;

  console.log("");
  console.log("🔑 Mint Authority:", payer.publicKey.toString());
  console.log("👤 Recipient:", recipientAddress.toString());
  console.log("💰 Amount:", amount, "tUSDC");
  console.log("💵 Mint:", mintAddress.toString());
  console.log("");

  // Check SOL balance
  const balance = await connection.getBalance(payer.publicKey);
  if (balance < 0.01 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Insufficient SOL balance! At least 0.01 SOL needed for transaction fees");
    console.log("   Current balance:", balance / anchor.web3.LAMPORTS_PER_SOL, "SOL");
    console.log("   Please run: solana airdrop 1");
    process.exit(1);
  }

  try {
    // Get or create recipient's token account
    console.log("🏦 Getting token account...");
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintAddress,
      recipientAddress,
      false, // allowOwnerOffCurve
      undefined, // commitment
      undefined, // confirmOptions
      TOKEN_PROGRAM_ID
    );
    console.log("   Token Account:", tokenAccount.address.toString());

    // Get balance before
    const balanceBefore = Number(tokenAccount.amount) / 1_000_000;
    console.log("   Balance Before:", balanceBefore.toFixed(6), "tUSDC");

    // Mint tokens
    console.log("");
    console.log("⏳ Minting tokens...");
    const mintAmount = amount * 1_000_000; // 6 decimals
    const signature = await mintTo(
      connection,
      payer,
      mintAddress,
      tokenAccount.address,
      payer.publicKey,
      mintAmount
    );

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed");

    // Get balance after
    const accountInfo = await connection.getTokenAccountBalance(tokenAccount.address);
    const balanceAfter = accountInfo.value.uiAmount || 0;

    console.log("");
    console.log("✅ Minting successful!");
    console.log("   Signature:", signature);
    console.log("   Balance After:", balanceAfter.toFixed(6), "tUSDC");
    console.log("");
    console.log(`🔗 https://explorer.solana.com/tx/${signature}?cluster=devnet`);

  } catch (error: any) {
    console.error("❌ Minting failed:", error.message || error);
    
    if (error.message?.includes("insufficient funds")) {
      console.log("");
      console.log("💡 Tip: Make sure you have enough SOL for transaction fees");
      console.log("   Run: solana airdrop 1");
    }
    
    if (error.message?.includes("Mint authority")) {
      console.log("");
      console.log("💡 Tip: Make sure the wallet is the mint authority");
      console.log("   Current wallet:", payer.publicKey.toString());
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
