import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";
import { getConnection, loadWallet, getAnchorConfig } from "./utils/anchor-config";

/**
 * Create test USDC token on devnet
 * 1. Create SPL Token (6 decimals like real USDC)
 * 2. Create associated token account
 * 3. Mint 10,000 test USDC
 */

async function main() {
  const config = getAnchorConfig();
  const connection = getConnection();
  const payer = loadWallet(config.walletPath);

  console.log("Payer:", payer.publicKey.toString());
  console.log("Balance:", (await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL, "SOL");

  // 1. Create token mint (6 decimals)
  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log("Mint:", mint.toString());

  // 2. Create token account
  const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  console.log("Token Account:", tokenAccount.address.toString());

  // 3. Mint 10,000 USDC
  const amount = 10_000 * 1_000_000;
  await mintTo(connection, payer, mint, tokenAccount.address, payer, amount);
  console.log("Minted:", amount / 1_000_000, "USDC");

  // Save config
  fs.writeFileSync("test-usdc-config.json", JSON.stringify({
    testUsdcMint: mint.toString(),
    tokenAccount: tokenAccount.address.toString(),
    network: "devnet",
    decimals: 6,
  }, null, 2));

  console.log("\nDone! Check balance: spl-token balance", mint.toString());
}

main().catch(console.error);

