import * as anchor from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";

/**
 * Mint more test USDC
 */

async function main() {
  // Read config
  const configPath = "test-usdc-config.json";
  if (!fs.existsSync(configPath)) {
    console.log("❌ Config file does not exist! Please run first: yarn create-test-usdc");
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const mintAddress = new PublicKey(config.testUsdcMint);

  // Get mint amount
  const amount = parseInt(process.argv[2] || "1000");
  if (isNaN(amount) || amount <= 0) {
    console.log("❌ Please provide a valid amount: yarn mint-test-usdc <amount>");
    return;
  }

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

  console.log("🔑 Wallet:", payer.publicKey.toString());
  console.log("💵 Minting amount:", amount, "test USDC");

  // Get token account
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintAddress,
    payer.publicKey
  );

  // Mint tokens
  const mintAmount = amount * 1_000_000; // 6 decimals
  const signature = await mintTo(
    connection,
    payer,
    mintAddress,
    tokenAccount.address,
    payer.publicKey,
    mintAmount
  );

  console.log("✅ Minting successful! Signature:", signature);
  console.log("💰 Added balance:", amount, "test USDC");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });

