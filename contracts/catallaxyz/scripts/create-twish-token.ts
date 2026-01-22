import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";

/**
 * Create Twish token on devnet for tipping functionality
 * This script will:
 * 1. Create a new SPL Token (Twish meme coin)
 * 2. Create associated token account for your wallet
 * 3. Mint initial supply to your account
 * 4. Save configuration for frontend use
 */

async function main() {
  // Setup connection
  const connection = new Connection(
    process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com",
    "confirmed"
  );

  // Load wallet
  const walletPath = process.env.ANCHOR_WALLET || "~/.config/solana/id.json";
  const walletFile = walletPath.replace("~", process.env.HOME || "");
  const secretKey = JSON.parse(fs.readFileSync(walletFile, "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log("🔑 Payer:", payer.publicKey.toString());

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log("💰 SOL Balance:", balance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

  if (balance < 0.1 * anchor.web3.LAMPORTS_PER_SOL) {
    console.log("⚠️  Insufficient balance! Please request devnet SOL first:");
    console.log("   solana airdrop 2");
    return;
  }

  console.log("\n🎁 Creating Twish token for tipping...");

  // Create Token Mint (6 decimals)
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    null, // freeze authority
    6, // 6 decimals
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );

  console.log("✅ Twish Token Mint Address:", mint.toString());

  // Create associated token account
  console.log("\n🏦 Creating token account...");
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );

  console.log("✅ Token Account Address:", tokenAccount.address.toString());

  // Mint initial supply (1,000,000 Twish)
  const mintAmount = 1_000_000 * 1_000_000; // 1M Twish (6 decimals)
  console.log("\n🪙 Minting Twish tokens...");
  const signature = await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer.publicKey,
    mintAmount
  );

  console.log("✅ Minting successful! Signature:", signature);
  console.log("💰 Balance:", mintAmount / 1_000_000, "Twish");

  // Save configuration
  const config = {
    network: "devnet",
    twishMint: mint.toString(),
    symbol: "Twish",
    decimals: 6,
    owner: payer.publicKey.toString(),
    tokenAccount: tokenAccount.address.toString(),
    initialSupply: mintAmount / 1_000_000,
    createdAt: new Date().toISOString(),
    note: "Meme coin for tipping markets and comments",
  };

  const configPath = "twish-config.json";
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log("\n📝 Configuration saved to:", configPath);

  console.log("\n" + "=".repeat(60));
  console.log("✨ Twish token created successfully!");
  console.log("=".repeat(60));
  console.log("\n📋 Frontend Configuration:");
  console.log("Add these to your frontend/.env.local:");
  console.log("----------------------------------------");
  console.log(`NEXT_PUBLIC_TIP_TOKEN_MINT=${mint.toString()}`);
  console.log("NEXT_PUBLIC_TIP_TOKEN_DECIMALS=6");
  console.log("NEXT_PUBLIC_TIP_TOKEN_SYMBOL=Twish");
  console.log("----------------------------------------");
  console.log("\n📋 Usage:");
  console.log("1. Users need Twish tokens to tip markets/comments");
  console.log("2. Mint more tokens: yarn mint-twish <amount>");
  console.log("3. Send to user: yarn mint-twish-to <address> <amount>");
  console.log("4. Check balance: spl-token balance " + mint.toString());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
