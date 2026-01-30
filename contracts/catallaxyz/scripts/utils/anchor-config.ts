/**
 * Anchor Configuration Utility
 * 
 * Reads provider configuration from Anchor.toml instead of requiring
 * environment variables (ANCHOR_PROVIDER_URL, ANCHOR_WALLET).
 * 
 * Priority:
 * 1. Environment variables (if set)
 * 2. Anchor.toml configuration
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// Simple TOML parser for Anchor.toml (avoids adding toml dependency)
function parseAnchorToml(content: string): {
  provider: { cluster: string; wallet: string };
} {
  const lines = content.split("\n");
  let inProvider = false;
  let cluster = "devnet";
  let wallet = "~/.config/solana/id.json";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "[provider]") {
      inProvider = true;
      continue;
    }
    if (trimmed.startsWith("[") && trimmed !== "[provider]") {
      inProvider = false;
      continue;
    }
    if (inProvider) {
      const clusterMatch = trimmed.match(/^cluster\s*=\s*"([^"]+)"/);
      if (clusterMatch) {
        cluster = clusterMatch[1];
      }
      const walletMatch = trimmed.match(/^wallet\s*=\s*"([^"]+)"/);
      if (walletMatch) {
        wallet = walletMatch[1];
      }
    }
  }

  return { provider: { cluster, wallet } };
}

// Map cluster name to RPC URL
function clusterToRpcUrl(cluster: string): string {
  const clusterMap: Record<string, string> = {
    localnet: "http://127.0.0.1:8899",
    localhost: "http://127.0.0.1:8899",
    devnet: "https://api.devnet.solana.com",
    testnet: "https://api.testnet.solana.com",
    mainnet: "https://api.mainnet-beta.solana.com",
    "mainnet-beta": "https://api.mainnet-beta.solana.com",
  };

  // If it's a URL, return as-is
  if (cluster.startsWith("http://") || cluster.startsWith("https://")) {
    return cluster;
  }

  return clusterMap[cluster] || "https://api.devnet.solana.com";
}

// Expand ~ to home directory
function expandHome(filepath: string): string {
  if (filepath.startsWith("~")) {
    return filepath.replace("~", process.env.HOME || "");
  }
  return filepath;
}

// Find Anchor.toml by walking up from current directory
function findAnchorToml(): string | null {
  let currentDir = process.cwd();
  
  while (currentDir !== "/") {
    const anchorTomlPath = path.join(currentDir, "Anchor.toml");
    if (fs.existsSync(anchorTomlPath)) {
      return anchorTomlPath;
    }
    currentDir = path.dirname(currentDir);
  }
  
  return null;
}

export interface AnchorConfig {
  rpcUrl: string;
  walletPath: string;
  cluster: string;
}

/**
 * Get Anchor configuration from Anchor.toml or environment variables
 */
export function getAnchorConfig(): AnchorConfig {
  // Priority 1: Environment variables
  if (process.env.ANCHOR_PROVIDER_URL && process.env.ANCHOR_WALLET) {
    return {
      rpcUrl: process.env.ANCHOR_PROVIDER_URL,
      walletPath: expandHome(process.env.ANCHOR_WALLET),
      cluster: process.env.ANCHOR_PROVIDER_URL.includes("mainnet") ? "mainnet" : 
               process.env.ANCHOR_PROVIDER_URL.includes("devnet") ? "devnet" : "localnet",
    };
  }

  // Priority 2: Anchor.toml
  const anchorTomlPath = findAnchorToml();
  if (!anchorTomlPath) {
    throw new Error(
      "Could not find Anchor.toml. Please run from the project directory or set ANCHOR_PROVIDER_URL and ANCHOR_WALLET environment variables."
    );
  }

  const content = fs.readFileSync(anchorTomlPath, "utf8");
  const config = parseAnchorToml(content);

  return {
    rpcUrl: clusterToRpcUrl(config.provider.cluster),
    walletPath: expandHome(config.provider.wallet),
    cluster: config.provider.cluster,
  };
}

/**
 * Load wallet keypair from file
 */
export function loadWallet(walletPath: string): Keypair {
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet file not found: ${walletPath}`);
  }
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

/**
 * Get AnchorProvider from Anchor.toml configuration
 * 
 * This is a drop-in replacement for AnchorProvider.env()
 */
export function getProvider(): AnchorProvider {
  const config = getAnchorConfig();
  const keypair = loadWallet(config.walletPath);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const wallet = new Wallet(keypair);

  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

/**
 * Get Connection from Anchor.toml configuration
 */
export function getConnection(): Connection {
  const config = getAnchorConfig();
  return new Connection(config.rpcUrl, "confirmed");
}

/**
 * Setup Anchor provider (sets global provider and returns it)
 */
export function setupProvider(): AnchorProvider {
  const provider = getProvider();
  anchor.setProvider(provider);
  return provider;
}

/**
 * Print configuration info
 */
export function printConfig(): void {
  const config = getAnchorConfig();
  console.log("📋 Anchor Configuration:");
  console.log("   Cluster:", config.cluster);
  console.log("   RPC URL:", config.rpcUrl);
  console.log("   Wallet:", config.walletPath);
}
