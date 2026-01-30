import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import { getConnection, loadWallet, getAnchorConfig, printConfig } from "./utils/anchor-config.js";

/**
 * Mint Twish tokens to your wallet or specified address
 * Usage: 
 *   yarn mint-twish <amount>              - Mint to your wallet
 *   yarn mint-twish-to <address> <amount> - Mint to specified address
 */

async function main() {
  const args = process.argv.slice(2);
  
  // Load twish config
  const configPath = "twish-config.json";
  if (!fs.existsSync(configPath)) {
    console.error("❌ twish-config.json not found. Run 'yarn create-twish' first.");
    process.exit(1);
  }
  
  const twishConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const mint = new PublicKey(twishConfig.twishMint);
  
  // Setup from Anchor.toml
  printConfig();
  const anchorConfig = getAnchorConfig();
  const connection = getConnection();
  const authority = loadWallet(anchorConfig.walletPath);

  // Determine recipient and amount
  let recipient: PublicKey;
  let amount: number;
  
  if (args.length === 1) {
    // Mint to self
    recipient = authority.publicKey;
    amount = parseFloat(args[0]);
  } else if (args.length === 2) {
    // Mint to specified address
    recipient = new PublicKey(args[0]);
    amount = parseFloat(args[1]);
  } else {
    console.log("Usage:");
    console.log("  yarn mint-twish <amount>              - Mint to your wallet");
    console.log("  yarn mint-twish-to <address> <amount> - Mint to specified address");
    process.exit(1);
  }

  if (isNaN(amount) || amount <= 0) {
    console.error("❌ Invalid amount");
    process.exit(1);
  }

  console.log(`🔑 Mint Authority: ${authority.publicKey.toString()}`);
  console.log(`👤 Recipient: ${recipient.toString()}`);
  console.log(`💰 Amount: ${amount} Twish`);

  // Get or create recipient token account
  console.log("\n🏦 Getting token account...");
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    recipient
  );

  // Mint tokens
  const rawAmount = BigInt(Math.floor(amount * 1_000_000));
  console.log(`\n🪙 Minting ${amount} Twish...`);
  
  const signature = await mintTo(
    connection,
    authority,
    mint,
    tokenAccount.address,
    authority.publicKey,
    rawAmount
  );

  console.log("✅ Minting successful!");
  console.log(`📝 Signature: ${signature}`);
  console.log(`\n💰 Check balance: spl-token balance ${mint.toString()} --owner ${recipient.toString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
