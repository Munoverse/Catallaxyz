import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
// @ts-ignore: Type definitions for generated IDL may not exist in some test environments.
import type { Catallaxyz } from "../target/types/catallaxyz";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  TOKEN_2022_PROGRAM_ID, 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo 
} from "@solana/spl-token";
import { expect } from "chai";

describe("Manifest CLOB Integration Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Catallaxyz as Program<Catallaxyz>;
  const payer = provider.wallet as anchor.Wallet;

  let usdcMint: PublicKey;
  let globalState: PublicKey;
  let market: PublicKey;
  let manifestMarket: PublicKey;
  let outcomeTokenMints: PublicKey[] = [];
  
  const USDC_DECIMALS = 6;
  const OUTCOME_COUNT = 2; // Binary market (YES/NO)
  const MANIFEST_PROGRAM_ID = new PublicKey("MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms");

  before(async () => {
    console.log("Setting up test environment...");
    
    // Create USDC mint
    usdcMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      USDC_DECIMALS
    );
    console.log("USDC Mint:", usdcMint.toString());

    // Derive global state PDA
    [globalState] = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      program.programId
    );
    console.log("Global State:", globalState.toString());
  });

  it("Initializes the global state", async () => {
    try {
      const feeRecipient = payer.publicKey;
      const switchboardQueue = Keypair.generate().publicKey; // Mock

      await program.methods
        .initialize({
          usdcMint,
          feeRecipient,
          feeBps: 100, // 1%
          switchboardQueue,
        })
        .accounts({
          payer: payer.publicKey,
          global: globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const globalAccount = await program.account.global.fetch(globalState);
      expect(globalAccount.usdcMint.toString()).to.equal(usdcMint.toString());
      expect(globalAccount.feeBps).to.equal(100);
      console.log("✓ Global state initialized");
    } catch (error) {
      console.error("Initialize error:", error);
      throw error;
    }
  });

  it("Creates a Manifest CLOB market", async () => {
    try {
      // Derive market PDA
      [market] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), payer.publicKey.toBuffer()],
        program.programId
      );

      // Mock Manifest market (in production, this would be created via Manifest program)
      manifestMarket = Keypair.generate().publicKey;
      
      const switchboardQueue = Keypair.generate().publicKey; // Mock
      
      // Create mock base and quote mints for Manifest market
      const baseMint = await createMint(
        provider.connection,
        payer.payer,
        payer.publicKey,
        null,
        USDC_DECIMALS
      );
      
      const quoteMint = usdcMint; // USDC as quote
      
      // Derive Manifest vault PDAs
      const [baseVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), manifestMarket.toBuffer(), baseMint.toBuffer()],
        MANIFEST_PROGRAM_ID
      );
      
      const [quoteVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), manifestMarket.toBuffer(), quoteMint.toBuffer()],
        MANIFEST_PROGRAM_ID
      );

      const marketParams = {
        question: "Will Bitcoin reach $100k by 2026?",
      };

      await program.methods
        .createManifestMarket(marketParams)
        .accounts({
          creator: payer.publicKey,
          market,
          global: globalState,
          manifestMarket,
          manifestProgram: MANIFEST_PROGRAM_ID,
          baseMint,
          quoteMint,
          baseVault,
          quoteVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const marketAccount = await program.account.market.fetch(market);
      expect(marketAccount.title).to.equal(marketParams.title);
      expect(marketAccount.useManifestOrderbook).to.be.true;
      expect(marketAccount.manifestMarket?.toString()).to.equal(manifestMarket.toString());
      
      // Store outcome token mints for later use
      outcomeTokenMints = marketAccount.outcomeTokenMints;
      
      console.log("✓ Manifest market created");
    } catch (error) {
      console.error("Create market error:", error);
      throw error;
    }
  });

  it("Places a limit order on Manifest orderbook", async () => {
    try {
      const outcomeIndex = 0; // YES token
      const price = 0.65; // 65 cents
      const size = 100; // 100 tokens
      const priceInLamports = Math.floor(price * 1_000_000);
      const sizeInLamports = Math.floor(size * 1_000_000);

      // Derive user's global account PDA for Manifest
      const [userGlobalAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("global"), payer.publicKey.toBuffer()],
        MANIFEST_PROGRAM_ID
      );

      await program.methods
        .manifestPlaceOrder({
          outcomeIndex,
          side: { bid: {} }, // Buy order
          price: priceInLamports,
          size: sizeInLamports,
          checkTermination: false,
        })
        .accounts({
          user: payer.publicKey,
          market,
          manifestMarket,
          manifestProgram: MANIFEST_PROGRAM_ID,
          userGlobalAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("✓ Limit order placed on Manifest");
    } catch (error) {
      console.error("Place order error:", error);
      throw error;
    }
  });

  it("Executes a market order (swap) on Manifest", async () => {
    try {
      const outcomeIndex = 0;
      const inAmount = 50_000_000; // 50 USDC
      const minOutAmount = 45_000_000; // Minimum 45 tokens (slippage protection)

      const [userGlobalAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("global"), payer.publicKey.toBuffer()],
        MANIFEST_PROGRAM_ID
      );

      await program.methods
        .manifestSwap({
          outcomeIndex,
          side: { bid: {} }, // Buy
          inAmount,
          minOutAmount,
          checkTermination: false,
        })
        .accounts({
          user: payer.publicKey,
          market,
          manifestMarket,
          manifestProgram: MANIFEST_PROGRAM_ID,
          userGlobalAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("✓ Market order (swap) executed on Manifest");
    } catch (error) {
      console.error("Swap error:", error);
      throw error;
    }
  });

  it("Cancels an order on Manifest", async () => {
    try {
      const orderId = 12345; // Mock order ID

      const [userGlobalAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("global"), payer.publicKey.toBuffer()],
        MANIFEST_PROGRAM_ID
      );

      await program.methods
        .manifestCancelOrder({
          orderId: new anchor.BN(orderId),
        })
        .accounts({
          user: payer.publicKey,
          market,
          manifestMarket,
          manifestProgram: MANIFEST_PROGRAM_ID,
          userGlobalAccount,
        })
        .rpc();

      console.log("✓ Order cancelled on Manifest");
    } catch (error) {
      console.error("Cancel order error:", error);
      throw error;
    }
  });

  it("Tests random market termination check", async () => {
    try {
      // Place an order with termination check enabled
      const outcomeIndex = 0;
      const price = 0.52;
      const size = 10;

      const [userGlobalAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("global"), payer.publicKey.toBuffer()],
        MANIFEST_PROGRAM_ID
      );

      // This should trigger VRF check (0.2% probability)
      await program.methods
        .manifestPlaceOrder({
          outcomeIndex,
          side: { bid: {} },
          price: Math.floor(price * 1_000_000),
          size: Math.floor(size * 1_000_000),
          checkTermination: true,
        })
        .accounts({
          user: payer.publicKey,
          market,
          manifestMarket,
          manifestProgram: MANIFEST_PROGRAM_ID,
          userGlobalAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const marketAccount = await program.account.market.fetch(market);
      console.log("Market status:", marketAccount.status);
      console.log("Is randomly terminated:", marketAccount.isRandomlyTerminated);
      
      console.log("✓ Random termination check completed");
    } catch (error) {
      console.error("Termination check error:", error);
      throw error;
    }
  });

  it("Settles the market", async () => {
    try {
      const winningOutcome = 0; // YES wins
      const finalYesPrice = 1.0;
      const finalNoPrice = 0.0;

      await program.methods
        .settleMarket({
          winningOutcome,
          finalYesPrice: Math.floor(finalYesPrice * 1_000_000),
          finalNoPrice: Math.floor(finalNoPrice * 1_000_000),
        })
        .accounts({
          authority: payer.publicKey,
          market,
        })
        .rpc();

      const marketAccount = await program.account.market.fetch(market);
      expect(marketAccount.status).to.have.property('settled');
      expect(marketAccount.winningOutcome).to.equal(winningOutcome);
      
      console.log("✓ Market settled");
    } catch (error) {
      console.error("Settle market error:", error);
      throw error;
    }
  });

  it("Redeems winning tokens", async () => {
    try {
      const outcomeIndex = 0; // YES tokens
      const amount = 100_000_000; // 100 tokens

      // Get user's token account
      const userTokenAccount = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer.payer,
        outcomeTokenMints[outcomeIndex],
        payer.publicKey
      );

      await program.methods
        .redeemWinningTokens({
          outcomeIndex,
          amount: new anchor.BN(amount),
        })
        .accounts({
          user: payer.publicKey,
          market,
          userTokenAccount: userTokenAccount.address,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const balance = await provider.connection.getTokenAccountBalance(userTokenAccount.address);
      console.log("User USDC balance after redemption:", balance.value.uiAmount);
      
      console.log("✓ Winning tokens redeemed");
    } catch (error) {
      console.error("Redeem error:", error);
      throw error;
    }
  });
});
