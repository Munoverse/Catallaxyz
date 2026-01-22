import * as anchor from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";

/**
 * Mint tUSDC to specified user
 * Usage:
 *   yarn ts-node scripts/mint-tusdc-to-user.ts <user_wallet_address> <amount>
 * 
 * Example:
 *   yarn ts-node scripts/mint-tusdc-to-user.ts 9p4sZ5ZdZQhjkUwp56aYaQXWVnXZNV5fTeZUpQgrYweN 5000
 */

async function main() {
  // Parse command line arguments
  const userWallet = process.argv[2];
  const amount = parseInt(process.argv[3] || "1000");

  if (!userWallet) {
    console.log("❌ Usage: yarn ts-node scripts/mint-tusdc-to-user.ts <user_wallet_address> <amount>");
    console.log("\nExample:");
    console.log("  yarn ts-node scripts/mint-tusdc-to-user.ts 9p4sZ5ZdZQhjkUwp56aYaQXWVnXZNV5fTeZUpQgrYweN 5000");
    process.exit(1);
  }

  if (isNaN(amount) || amount <= 0) {
    console.log("❌ Amount must be a positive integer");
    process.exit(1);
  }

  // Read config
  const configPath = "test-usdc-config.json";
  if (!fs.existsSync(configPath)) {
    console.log("❌ Config file does not exist! Please run first: yarn create-test-usdc");
    console.log("   or manually create test-usdc-config.json");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const mintAddress = new PublicKey(config.testUsdcMint);
  const userAddress = new PublicKey(userWallet);

  // Setup connection
  const connection = new Connection(
    process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com",
    "confirmed"
  );

  // Load mint authority wallet (must be the wallet that created tUSDC)
  const walletPath = process.env.ANCHOR_WALLET || "~/.config/solana/id.json";
  const walletFile = walletPath.replace("~", process.env.HOME || "");
  
  if (!fs.existsSync(walletFile)) {
    console.log("❌ Wallet file does not exist:", walletFile);
    console.log("   Please set ANCHOR_WALLET environment variable or ensure ~/.config/solana/id.json exists");
    process.exit(1);
  }

  const secretKey = JSON.parse(fs.readFileSync(walletFile, "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log("🔑 Mint Authority:", payer.publicKey.toString());
  console.log("👤 Target User:", userAddress.toString());
  console.log("💰 Amount:", amount, "tUSDC");
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
    // Get or create user's token account
    console.log("🏦 Checking user's tUSDC account...");
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintAddress,
      userAddress,
      false, // allowOwnerOffCurve
      undefined, // commitment
      undefined, // confirmOptions
      TOKEN_PROGRAM_ID
    );

    console.log("✅ User token account:", userTokenAccount.address.toString());

    // Check if account is newly created
    if (userTokenAccount.amount === BigInt(0)) {
      console.log("   (Newly created account)");
    } else {
      const currentBalance = Number(userTokenAccount.amount) / 1_000_000;
      console.log("   Current balance:", currentBalance, "tUSDC");
    }

    // Mint tokens
    const mintAmount = amount * 1_000_000; // 6 decimals
    console.log("\n💵 Minting", amount, "tUSDC...");
    
    const signature = await mintTo(
      connection,
      payer,
      mintAddress,
      userTokenAccount.address,
      payer.publicKey, // mint authority
      mintAmount,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    console.log("✅ Minting successful!");
    console.log("📝 Transaction:", signature);
    console.log("🔗 Explorer:", `https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Get new balance
    const updatedAccount = await connection.getTokenAccountBalance(userTokenAccount.address);
    const newBalance = Number(updatedAccount.value.amount) / 1_000_000;
    console.log("💰 New balance:", newBalance, "tUSDC");

    console.log("\n" + "=".repeat(60));
    console.log("✨ Complete!");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Unexpected error:", err);
    process.exit(1);
  });
