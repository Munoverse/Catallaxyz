import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import type { Catallaxyz } from "../target/types/catallaxyz";
import { setupProvider, getAnchorConfig, printConfig } from "./utils/anchor-config.js";

/**
 * Security Verification Script
 * 
 * Check program configuration security to ensure:
 * 1. Using correct token mint
 * 2. Frontend config matches on-chain
 * 3. Treasury configured correctly
 * 4. No obvious configuration errors
 * 
 * Usage:
 *   yarn verify-security
 */

// Known token mint addresses
const KNOWN_MINTS = {
  // Mainnet USDC (official)
  mainnet_usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  
  // Devnet tUSDC (test)
  devnet_tusdc: "DmPAkkBZ5hSv7GmioeNSa59jpTybHYRz5nt3NgwdQc4G",
  
  // Other common test mints
  // devnet_usdc_circle: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

interface SecurityCheck {
  name: string;
  status: "✅ PASS" | "⚠️ WARNING" | "❌ FAIL";
  message: string;
  details?: string;
}

async function main() {
  console.log("🔒 Catallaxyz Security Verification\n");
  console.log("=".repeat(60));
  
  const checks: SecurityCheck[] = [];
  
  // 1. Get configuration from Anchor.toml
  printConfig();
  const config = getAnchorConfig();
  const rpcUrl = config.rpcUrl;
  const isMainnet = rpcUrl.includes("mainnet");
  const isDevnet = rpcUrl.includes("devnet");
  
  console.log("\n📡 Network Info:");
  console.log("   RPC:", rpcUrl);
  console.log("   Type:", isMainnet ? "Mainnet" : isDevnet ? "Devnet" : "Unknown");
  
  // 2. Load program
  const provider = setupProvider();
  const connection = provider.connection;
  
  const idlPath = "./target/idl/catallaxyz.json";
  if (!fs.existsSync(idlPath)) {
    console.log("\n❌ IDL file does not exist! Please run first: anchor build");
    process.exit(1);
  }
  
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const programId = new PublicKey(idl.address);
  const program = new Program(idl, provider) as Program<Catallaxyz>;
  
  console.log("   Program ID:", programId.toString());
  
  // 3. Check Global account
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    programId
  );
  
  console.log("\n🌐 Global Account:");
  console.log("   PDA:", globalPda.toString());
  
  let globalAccount: any;
  try {
    globalAccount = await program.account.global.fetch(globalPda);
    console.log("   Status: ✅ Initialized");
  } catch (error: any) {
    if (error.message.includes("Account does not exist")) {
      console.log("   Status: ❌ Not initialized");
      checks.push({
        name: "Global Account",
        status: "❌ FAIL",
        message: "Program not initialized yet",
        details: "Please run first: yarn init-with-tusdc (devnet) or initialization script (mainnet)"
      });
      
      console.log("\n" + "=".repeat(60));
      console.log("📋 Security Check Results:");
      printChecks(checks);
      process.exit(1);
    }
    throw error;
  }
  
  // 4. Verify USDC mint configuration
  const configuredMint = globalAccount.usdcMint.toString();
  console.log("   USDC Mint:", configuredMint);
  
  // Check 1: Is mint a known safe mint
  let mintCheck: SecurityCheck;
  if (configuredMint === KNOWN_MINTS.mainnet_usdc) {
    mintCheck = {
      name: "Token Mint Verification",
      status: "✅ PASS",
      message: "Using official USDC (Mainnet)",
      details: "This is Circle's official USDC mint address"
    };
  } else if (configuredMint === KNOWN_MINTS.devnet_tusdc) {
    mintCheck = {
      name: "Token Mint Verification",
      status: "✅ PASS",
      message: "Using test tUSDC (Devnet)",
      details: "This is the project's test USDC mint address"
    };
  } else {
    mintCheck = {
      name: "Token Mint Verification",
      status: "⚠️ WARNING",
      message: "Using custom mint address",
      details: `Mint: ${configuredMint}\n   Please confirm this is the correct token address`
    };
  }
  checks.push(mintCheck);
  
  // Check 2: Network and token match
  let networkMintCheck: SecurityCheck;
  if (isMainnet && configuredMint === KNOWN_MINTS.mainnet_usdc) {
    networkMintCheck = {
      name: "Network-Token Match",
      status: "✅ PASS",
      message: "Mainnet using real USDC",
      details: "Configuration correct"
    };
  } else if (isDevnet && configuredMint === KNOWN_MINTS.devnet_tusdc) {
    networkMintCheck = {
      name: "Network-Token Match",
      status: "✅ PASS",
      message: "Devnet using test tUSDC",
      details: "Configuration correct"
    };
  } else if (isMainnet && configuredMint === KNOWN_MINTS.devnet_tusdc) {
    networkMintCheck = {
      name: "Network-Token Match",
      status: "❌ FAIL",
      message: "Mainnet using test token!",
      details: "Critical error! Mainnet should use real USDC, not Devnet test tokens"
    };
  } else if (isDevnet && configuredMint === KNOWN_MINTS.mainnet_usdc) {
    networkMintCheck = {
      name: "Network-Token Match",
      status: "⚠️ WARNING",
      message: "Devnet using Mainnet USDC address",
      details: "While technically feasible, recommended to use test tokens on Devnet for easier minting"
    };
  } else {
    networkMintCheck = {
      name: "Network-Token Match",
      status: "⚠️ WARNING",
      message: "Using custom token",
      details: "Please confirm token address is correct"
    };
  }
  checks.push(networkMintCheck);
  
  // 5. Check frontend configuration (if exists)
  const frontendEnvPath = "../frontend/.env";
  if (fs.existsSync(frontendEnvPath)) {
    console.log("\n🎨 Frontend Configuration:");
    const envContent = fs.readFileSync(frontendEnvPath, "utf8");
    const frontendMintMatch = envContent.match(/NEXT_PUBLIC_USDC_MINT_ADDRESS=([^\s\n]+)/);
    
    if (frontendMintMatch) {
      const frontendMint = frontendMintMatch[1];
      console.log("   Configured Mint:", frontendMint);
      
      let frontendCheck: SecurityCheck;
      if (frontendMint === configuredMint) {
        frontendCheck = {
          name: "Frontend Config Consistency",
          status: "✅ PASS",
          message: "Frontend matches on-chain config",
          details: "Frontend and program use same USDC mint"
        };
      } else {
        frontendCheck = {
          name: "Frontend Config Consistency",
          status: "❌ FAIL",
          message: "Frontend config mismatch!",
          details: `Frontend: ${frontendMint}\n   On-chain: ${configuredMint}\n   This will cause transaction failures!`
        };
      }
      checks.push(frontendCheck);
    } else {
      checks.push({
        name: "Frontend Configuration",
        status: "⚠️ WARNING",
        message: "USDC_MINT_ADDRESS config not found",
        details: "Please set NEXT_PUBLIC_USDC_MINT_ADDRESS in frontend/.env"
      });
    }
  } else {
    console.log("\n🎨 Frontend Configuration: ⚠️  frontend/.env not found");
    checks.push({
      name: "Frontend Config File",
      status: "⚠️ WARNING",
      message: "frontend/.env file not found",
      details: "Please create frontend environment config file"
    });
  }
  
  // 6. Check treasuries
  console.log("\n🏦 Treasury Status:");
  
  const [platformTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform_treasury")],
    programId
  );
  
  const [vrfTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    programId
  );
  
  try {
    const platformTreasuryAccount = await connection.getAccountInfo(platformTreasuryPda);
    const vrfTreasuryAccount = await connection.getAccountInfo(vrfTreasuryPda);
    
    const platformInitialized = platformTreasuryAccount !== null;
    const vrfInitialized = vrfTreasuryAccount !== null;
    
    console.log("   Platform Treasury:", platformInitialized ? "✅ Initialized" : "❌ Not initialized");
    console.log("   VRF Treasury:", vrfInitialized ? "✅ Initialized" : "❌ Not initialized");
    
    if (!platformInitialized || !vrfInitialized) {
      checks.push({
        name: "Treasury Initialization",
        status: "⚠️ WARNING",
        message: "Some treasuries not initialized",
        details: "Please run init-platform-treasury and init-treasury"
      });
    } else {
      checks.push({
        name: "Treasury Initialization",
        status: "✅ PASS",
        message: "All treasuries initialized",
      });
    }
  } catch (error) {
    checks.push({
      name: "Treasury Check",
      status: "⚠️ WARNING",
      message: "Cannot check treasury status",
      details: String(error)
    });
  }
  
  // 7. Check test-usdc-config.json consistency (devnet only)
  if (isDevnet) {
    const configPath = "./test-usdc-config.json";
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const configMint = config.testUsdcMint;
      
      console.log("\n📝 Test Config File:");
      console.log("   Mint:", configMint);
      
      if (configMint === configuredMint) {
        checks.push({
          name: "Test Config Consistency",
          status: "✅ PASS",
          message: "test-usdc-config.json matches on-chain",
        });
      } else {
        checks.push({
          name: "Test Config Consistency",
          status: "⚠️ WARNING",
          message: "test-usdc-config.json does not match on-chain",
          details: `Config file: ${configMint}\n   On-chain: ${configuredMint}`
        });
      }
    }
  }
  
  // 8. Authority check
  console.log("\n🔑 Authority:");
  console.log("   Address:", globalAccount.authority.toString());
  
  checks.push({
    name: "Authority Configuration",
    status: "✅ PASS",
    message: "Authority is set",
    details: `Authority: ${globalAccount.authority.toString()}`
  });
  
  // Print results
  console.log("\n" + "=".repeat(60));
  console.log("📋 Security Check Results:\n");
  
  printChecks(checks);
  
  // Statistics
  const passed = checks.filter(c => c.status === "✅ PASS").length;
  const warnings = checks.filter(c => c.status === "⚠️ WARNING").length;
  const failed = checks.filter(c => c.status === "❌ FAIL").length;
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 Statistics:");
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ⚠️  Warnings: ${warnings}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total: ${checks.length}`);
  
  // Final conclusion
  console.log("\n" + "=".repeat(60));
  if (failed > 0) {
    console.log("❌ Security check failed!");
    console.log("   Please fix the errors above before continuing");
    process.exit(1);
  } else if (warnings > 0) {
    console.log("⚠️  Security check passed with warnings");
    console.log("   Recommend reviewing and resolving warning items");
  } else {
    console.log("✅ All security checks passed!");
    console.log("   Configuration is safe, can continue using");
  }
  console.log("=".repeat(60));
}

function printChecks(checks: SecurityCheck[]) {
  checks.forEach((check, index) => {
    console.log(`${index + 1}. ${check.status} ${check.name}`);
    console.log(`   ${check.message}`);
    if (check.details) {
      console.log(`   ${check.details}`);
    }
    console.log();
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error during verification:", err);
    process.exit(1);
  });
