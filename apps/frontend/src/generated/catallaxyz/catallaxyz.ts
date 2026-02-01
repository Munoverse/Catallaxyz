/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/catallaxyz.json`.
 */
export type Catallaxyz = {
  "address": "4Vpqj1dsjLX7cQ3z85Sh3ZUQ1Adz7rdzvMQnbtgx7n9u",
  "metadata": {
    "name": "catallaxyz",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addOperator",
      "docs": [
        "Add an operator (admin only)"
      ],
      "discriminator": [
        149,
        142,
        187,
        68,
        33,
        250,
        87,
        105
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin (authority)"
          ],
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "addOperatorParams"
            }
          }
        }
      ]
    },
    {
      "name": "cancelOrder",
      "docs": [
        "Cancel an order on-chain (maker only)"
      ],
      "discriminator": [
        95,
        129,
        237,
        240,
        8,
        49,
        223,
        132
      ],
      "accounts": [
        {
          "name": "maker",
          "docs": [
            "Maker (order creator) who wants to cancel"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "orderStatus",
          "docs": [
            "Order status PDA"
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "cancelOrderParams"
            }
          }
        }
      ]
    },
    {
      "name": "createMarket",
      "docs": [
        "Create a new prediction market"
      ],
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "params.market_id"
              }
            ]
          }
        },
        {
          "name": "switchboardQueue"
        },
        {
          "name": "randomnessAccount",
          "docs": [
            "Switchboard randomness account (fixed per market)"
          ]
        },
        {
          "name": "platformTreasury",
          "docs": [
            "Platform treasury (collects market creation fee)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "creatorUsdcAccount",
          "docs": [
            "Creator's USDC account (for paying creation fee)"
          ],
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createMarketParams"
            }
          }
        }
      ]
    },
    {
      "name": "depositUsdc",
      "docs": [
        "Deposit USDC into the market vault for trading",
        "Creates UserBalance and UserPosition accounts if needed"
      ],
      "discriminator": [
        184,
        148,
        250,
        169,
        224,
        213,
        34,
        126
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "userBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "marketUsdcVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "userUsdcAccount",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "depositUsdcParams"
            }
          }
        }
      ]
    },
    {
      "name": "distributeLiquidityReward",
      "docs": [
        "Distribute liquidity reward to a recipient (admin only)"
      ],
      "discriminator": [
        239,
        3,
        184,
        135,
        226,
        240,
        70,
        146
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Global authority (program admin)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "docs": [
            "Global state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "rewardTreasury",
          "docs": [
            "Reward treasury (holds liquidity rewards)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "recipientUsdcAccount",
          "docs": [
            "Recipient USDC account"
          ],
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "distributeLiquidityRewardParams"
            }
          }
        }
      ]
    },
    {
      "name": "fillOrder",
      "docs": [
        "Fill a single signed order",
        "Operator acts as counterparty"
      ],
      "discriminator": [
        232,
        122,
        115,
        25,
        199,
        143,
        136,
        162
      ],
      "accounts": [
        {
          "name": "operator",
          "docs": [
            "Operator executing the fill (must be in global.operators)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "orderStatus",
          "docs": [
            "Order status PDA - tracks fill state"
          ],
          "writable": true
        },
        {
          "name": "makerNonce",
          "docs": [
            "User nonce for maker"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  110,
                  111,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "makerBalance",
          "docs": [
            "Maker's USDC balance"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "makerPosition",
          "docs": [
            "Maker's position (YES/NO balances)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "operatorBalance",
          "docs": [
            "Operator's USDC balance (as counterparty)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "operatorPosition",
          "docs": [
            "Operator's position (as counterparty)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "maker"
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "fillOrderParams"
            }
          }
        }
      ]
    },
    {
      "name": "incrementNonce",
      "docs": [
        "Increment user nonce to batch-cancel all orders with lower nonce"
      ],
      "discriminator": [
        84,
        149,
        209,
        233,
        228,
        66,
        195,
        237
      ],
      "accounts": [
        {
          "name": "user",
          "docs": [
            "User who wants to increment their nonce"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "userNonce",
          "docs": [
            "User's nonce account"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  110,
                  111,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initCreatorTreasury",
      "docs": [
        "Initialize creator treasury (admin only)"
      ],
      "discriminator": [
        229,
        171,
        165,
        85,
        215,
        84,
        75,
        214
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "creatorTreasury",
          "docs": [
            "Creator treasury token account (USDC)",
            "Owned by global PDA, stores creator incentive pool"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initMarketVault",
      "docs": [
        "Initialize market USDC vault (should be called after market creation)"
      ],
      "discriminator": [
        40,
        89,
        237,
        125,
        101,
        18,
        210,
        155
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "marketUsdcVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account - validated in handler"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initPlatformTreasury",
      "docs": [
        "Initialize the platform treasury for collecting trading and creation fees"
      ],
      "discriminator": [
        205,
        200,
        152,
        236,
        224,
        206,
        110,
        216
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "platformTreasury",
          "docs": [
            "Platform treasury token account (USDC)",
            "Owned by global PDA, stores all platform fees"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initRewardTreasury",
      "docs": [
        "Initialize reward treasury (admin only)"
      ],
      "discriminator": [
        120,
        162,
        200,
        93,
        243,
        201,
        127,
        251
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "rewardTreasury",
          "docs": [
            "Rewards treasury token account (USDC)",
            "Owned by global PDA, stores liquidity rewards pool"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize the global program state"
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeParams"
            }
          }
        }
      ]
    },
    {
      "name": "matchOrders",
      "docs": [
        "Match taker order against multiple maker orders atomically",
        "Supports COMPLEMENTARY, MINT, and MERGE match types"
      ],
      "discriminator": [
        17,
        1,
        201,
        93,
        7,
        51,
        251,
        134
      ],
      "accounts": [
        {
          "name": "operator",
          "docs": [
            "Operator executing the match"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "takerOrderStatus",
          "docs": [
            "Taker order status"
          ],
          "writable": true
        },
        {
          "name": "takerNonce",
          "docs": [
            "Taker's nonce account"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  110,
                  111,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "taker"
              }
            ]
          }
        },
        {
          "name": "takerBalance",
          "docs": [
            "Taker's USDC balance"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "taker"
              }
            ]
          }
        },
        {
          "name": "takerPosition",
          "docs": [
            "Taker's position"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "taker"
              }
            ]
          }
        },
        {
          "name": "taker"
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "matchOrdersParams"
            }
          }
        }
      ]
    },
    {
      "name": "mergePositionSingle",
      "docs": [
        "Merge YES and NO positions back to USDC for a SINGLE question",
        "Merge 1 YES + 1 NO position back into 1 USDC"
      ],
      "discriminator": [
        95,
        179,
        69,
        121,
        250,
        119,
        249,
        101
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "docs": [
            "Global state account (contains USDC mint reference)"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market account"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "userUsdcAccount",
          "docs": [
            "User's USDC account"
          ],
          "writable": true
        },
        {
          "name": "marketUsdcVault",
          "docs": [
            "Market's USDC vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "docs": [
            "User position PDA (tracks YES/NO balances)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "mergePositionSingleParams"
            }
          }
        }
      ]
    },
    {
      "name": "pauseMarket",
      "docs": [
        "Pause a market (admin only - emergency stop)",
        "Disables trading and order placement"
      ],
      "discriminator": [
        216,
        238,
        4,
        164,
        65,
        11,
        162,
        91
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Global authority (program admin)"
          ],
          "signer": true
        },
        {
          "name": "global",
          "docs": [
            "Global state"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market to pause"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "pauseTrading",
      "docs": [
        "Pause global trading (admin only)"
      ],
      "discriminator": [
        196,
        206,
        8,
        164,
        69,
        49,
        79,
        234
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin (authority)"
          ],
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "redeemSingleOutcome",
      "docs": [
        "Redeem single outcome position after settlement or termination"
      ],
      "discriminator": [
        144,
        131,
        17,
        86,
        166,
        251,
        84,
        156
      ],
      "accounts": [
        {
          "name": "global",
          "docs": [
            "Global account (for validation)"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "userOutcomeToken",
          "docs": [
            "User position account (PDA)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "marketVault",
          "docs": [
            "Market USDC vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "userUsdcAccount",
          "docs": [
            "User's USDC account to receive redemption"
          ],
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "user",
          "docs": [
            "User (signer)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "redeemSingleOutcomeParams"
            }
          }
        }
      ]
    },
    {
      "name": "removeOperator",
      "docs": [
        "Remove an operator (admin only)"
      ],
      "discriminator": [
        84,
        183,
        126,
        251,
        137,
        150,
        214,
        134
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin (authority)"
          ],
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "removeOperatorParams"
            }
          }
        }
      ]
    },
    {
      "name": "requestRandomness",
      "docs": [
        "Request Switchboard randomness for market settlement check"
      ],
      "discriminator": [
        213,
        5,
        173,
        166,
        37,
        236,
        31,
        18
      ],
      "accounts": [
        {
          "name": "market"
        },
        {
          "name": "randomnessAccount",
          "docs": [
            "Switchboard randomness account"
          ]
        },
        {
          "name": "payer",
          "docs": [
            "User requesting validation (no fees charged for this instruction)"
          ],
          "signer": true
        },
        {
          "name": "switchboardProgram",
          "docs": [
            "Switchboard program"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "resumeMarket",
      "docs": [
        "Resume a paused market (admin only)",
        "Re-enables trading and order placement"
      ],
      "discriminator": [
        198,
        120,
        104,
        87,
        44,
        103,
        108,
        143
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Global authority (program admin)"
          ],
          "signer": true
        },
        {
          "name": "global",
          "docs": [
            "Global state"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market to resume"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "setKeeper",
      "docs": [
        "Set or update the keeper wallet address.",
        "Authority only."
      ],
      "discriminator": [
        102,
        94,
        23,
        78,
        157,
        222,
        243,
        214
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Global authority (admin only)"
          ],
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "setKeeperParams"
            }
          }
        }
      ]
    },
    {
      "name": "settleMarket",
      "docs": [
        "Settle the market based on last trade outcome"
      ],
      "discriminator": [
        193,
        153,
        95,
        216,
        166,
        6,
        144,
        217
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "marketUsdcVault",
          "writable": true
        },
        {
          "name": "creatorTreasury",
          "docs": [
            "Creator treasury (holds creator incentives)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "creatorUsdcAccount",
          "docs": [
            "Creator USDC account (receives incentive payout)"
          ],
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "switchboardOracle"
        },
        {
          "name": "switchboardProgram"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "settleWithRandomness",
      "docs": [
        "Check and settle market using Switchboard randomness",
        "Implements random termination mechanism from the paper"
      ],
      "discriminator": [
        8,
        161,
        103,
        177,
        119,
        247,
        247,
        137
      ],
      "accounts": [
        {
          "name": "global",
          "docs": [
            "Global state (for treasury authority)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "creatorTreasury",
          "docs": [
            "Creator treasury (holds creator incentives)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "creatorUsdcAccount",
          "docs": [
            "Creator USDC account (receives incentive payout)"
          ],
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "marketUsdcVault",
          "docs": [
            "Market USDC vault (backing YES/NO positions)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "randomnessAccount",
          "docs": [
            "Switchboard randomness account"
          ],
          "writable": true
        },
        {
          "name": "caller",
          "docs": [
            "Caller"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "switchboardProgram",
          "docs": [
            "Switchboard program"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "settleWithRandomnessParams"
            }
          }
        }
      ]
    },
    {
      "name": "splitPositionSingle",
      "docs": [
        "Split USDC into YES and NO positions for a SINGLE question",
        "Split 1 USDC into 1 YES + 1 NO position"
      ],
      "discriminator": [
        107,
        234,
        43,
        231,
        87,
        180,
        210,
        128
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "docs": [
            "Global state account (contains USDC mint reference)"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market account"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "userUsdcAccount",
          "docs": [
            "User's USDC account"
          ],
          "writable": true
        },
        {
          "name": "marketUsdcVault",
          "docs": [
            "Market's USDC vault"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "docs": [
            "User position PDA (tracks YES/NO balances)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "splitPositionSingleParams"
            }
          }
        }
      ]
    },
    {
      "name": "terminateIfInactive",
      "docs": [
        "Terminate a market if it has been inactive for >= 7 days.",
        "Keeper or authority only.",
        "Note: Batch termination is handled at the backend level by bundling",
        "multiple terminateIfInactive instructions into a single transaction."
      ],
      "discriminator": [
        132,
        13,
        225,
        19,
        144,
        215,
        128,
        228
      ],
      "accounts": [
        {
          "name": "global",
          "docs": [
            "Global state (for keeper/authority check)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "caller",
          "docs": [
            "Keeper or authority (either can call this instruction)"
          ],
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "marketUsdcVault",
          "docs": [
            "Market USDC vault (backing YES/NO positions)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "creatorTreasury",
          "docs": [
            "Creator treasury (holds creator incentives)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "creatorUsdcAccount",
          "docs": [
            "Creator USDC account (receives incentive payout)"
          ],
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint account"
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "unpauseTrading",
      "docs": [
        "Unpause global trading (admin only)"
      ],
      "discriminator": [
        122,
        173,
        43,
        44,
        240,
        26,
        56,
        16
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Admin (authority)"
          ],
          "signer": true
        },
        {
          "name": "global",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateFeeRates",
      "docs": [
        "Update market fee rates (admin only)",
        "Adjusts the dynamic fee curve parameters"
      ],
      "discriminator": [
        99,
        0,
        214,
        188,
        66,
        253,
        99,
        96
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Global authority (program admin)"
          ],
          "signer": true
        },
        {
          "name": "global",
          "docs": [
            "Global state - now stores all fee configuration"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateFeeRatesParams"
            }
          }
        }
      ]
    },
    {
      "name": "updateMarketParams",
      "docs": [
        "Update market termination probability and maker rebate rate (admin only)"
      ],
      "discriminator": [
        70,
        117,
        202,
        191,
        205,
        174,
        92,
        82
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Global authority (program admin)"
          ],
          "signer": true
        },
        {
          "name": "global",
          "docs": [
            "Global state"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "docs": [
            "Market to update"
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateMarketParamsInput"
            }
          }
        }
      ]
    },
    {
      "name": "withdrawPlatformFees",
      "docs": [
        "Withdraw platform fees (admin only)",
        "Transfers accumulated fees from platform treasury"
      ],
      "discriminator": [
        87,
        24,
        138,
        122,
        62,
        146,
        186,
        199
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Global authority (program admin)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "docs": [
            "Global state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "platformTreasury",
          "docs": [
            "Platform treasury (holds accumulated fees)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "recipientUsdcAccount",
          "docs": [
            "Recipient USDC account (where fees will be sent)"
          ],
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "withdrawPlatformFeesParams"
            }
          }
        }
      ]
    },
    {
      "name": "withdrawRewardFees",
      "docs": [
        "Withdraw reward treasury funds (admin only)"
      ],
      "discriminator": [
        3,
        247,
        51,
        88,
        94,
        191,
        204,
        43
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Global authority (program admin)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "docs": [
            "Global state"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "rewardTreasury",
          "docs": [
            "Reward treasury (holds liquidity rewards)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  95,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "recipientUsdcAccount",
          "docs": [
            "Recipient USDC account (where rewards will be sent)"
          ],
          "writable": true
        },
        {
          "name": "usdcMint",
          "docs": [
            "USDC mint"
          ]
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "withdrawRewardFeesParams"
            }
          }
        }
      ]
    },
    {
      "name": "withdrawUsdc",
      "docs": [
        "Withdraw USDC from the market vault",
        "Returns USDC to user's token account"
      ],
      "discriminator": [
        114,
        49,
        72,
        184,
        27,
        156,
        243,
        155
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "global",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  108,
                  111,
                  98,
                  97,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.creator",
                "account": "market"
              },
              {
                "kind": "account",
                "path": "market.market_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "userBalance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  98,
                  97,
                  108,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "marketUsdcVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "userUsdcAccount",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "withdrawUsdcParams"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "global",
      "discriminator": [
        167,
        232,
        232,
        177,
        200,
        108,
        114,
        127
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "orderStatus",
      "discriminator": [
        46,
        90,
        241,
        73,
        178,
        104,
        65,
        3
      ]
    },
    {
      "name": "userBalance",
      "discriminator": [
        187,
        237,
        208,
        146,
        86,
        132,
        29,
        191
      ]
    },
    {
      "name": "userNonce",
      "discriminator": [
        235,
        133,
        1,
        243,
        18,
        135,
        88,
        224
      ]
    },
    {
      "name": "userPosition",
      "discriminator": [
        251,
        248,
        209,
        245,
        83,
        234,
        17,
        27
      ]
    }
  ],
  "events": [
    {
      "name": "ctfTokensRedeemed",
      "discriminator": [
        180,
        212,
        79,
        191,
        1,
        154,
        238,
        199
      ]
    },
    {
      "name": "globalFeeRatesUpdated",
      "discriminator": [
        145,
        147,
        220,
        1,
        130,
        248,
        42,
        31
      ]
    },
    {
      "name": "globalTradingPaused",
      "discriminator": [
        116,
        164,
        60,
        65,
        48,
        65,
        182,
        158
      ]
    },
    {
      "name": "globalTradingUnpaused",
      "discriminator": [
        26,
        170,
        194,
        23,
        133,
        189,
        203,
        115
      ]
    },
    {
      "name": "liquidityRewardDistributed",
      "discriminator": [
        79,
        30,
        179,
        254,
        137,
        35,
        255,
        176
      ]
    },
    {
      "name": "marketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "marketCreationFeeCollected",
      "discriminator": [
        84,
        127,
        47,
        167,
        6,
        25,
        123,
        125
      ]
    },
    {
      "name": "marketParamsUpdated",
      "discriminator": [
        88,
        163,
        120,
        117,
        160,
        118,
        99,
        60
      ]
    },
    {
      "name": "marketPaused",
      "discriminator": [
        174,
        108,
        119,
        17,
        118,
        97,
        185,
        4
      ]
    },
    {
      "name": "marketResumed",
      "discriminator": [
        144,
        13,
        227,
        141,
        241,
        104,
        229,
        55
      ]
    },
    {
      "name": "marketSettled",
      "discriminator": [
        237,
        212,
        22,
        175,
        201,
        117,
        215,
        99
      ]
    },
    {
      "name": "marketTerminated",
      "discriminator": [
        111,
        98,
        128,
        214,
        122,
        12,
        64,
        43
      ]
    },
    {
      "name": "nonceIncremented",
      "discriminator": [
        134,
        4,
        127,
        95,
        73,
        115,
        160,
        150
      ]
    },
    {
      "name": "operatorAdded",
      "discriminator": [
        216,
        247,
        101,
        54,
        51,
        70,
        215,
        192
      ]
    },
    {
      "name": "operatorRemoved",
      "discriminator": [
        223,
        10,
        131,
        23,
        165,
        154,
        14,
        191
      ]
    },
    {
      "name": "orderCancelled",
      "discriminator": [
        108,
        56,
        128,
        68,
        168,
        113,
        168,
        239
      ]
    },
    {
      "name": "orderFilled",
      "discriminator": [
        120,
        124,
        109,
        66,
        249,
        116,
        174,
        30
      ]
    },
    {
      "name": "ordersMatched",
      "discriminator": [
        178,
        8,
        229,
        95,
        192,
        161,
        128,
        196
      ]
    },
    {
      "name": "platformFeesWithdrawn",
      "discriminator": [
        21,
        216,
        172,
        170,
        221,
        168,
        147,
        193
      ]
    },
    {
      "name": "positionMerged",
      "discriminator": [
        239,
        79,
        71,
        159,
        201,
        11,
        107,
        245
      ]
    },
    {
      "name": "positionSplit",
      "discriminator": [
        5,
        144,
        121,
        43,
        146,
        210,
        116,
        5
      ]
    },
    {
      "name": "rewardFeesWithdrawn",
      "discriminator": [
        168,
        88,
        39,
        200,
        234,
        204,
        80,
        70
      ]
    },
    {
      "name": "terminationCheckResult",
      "discriminator": [
        164,
        188,
        59,
        174,
        115,
        247,
        59,
        166
      ]
    },
    {
      "name": "tradingFeeCollected",
      "discriminator": [
        95,
        25,
        149,
        77,
        23,
        219,
        174,
        23
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "marketNotActive",
      "msg": "Market is not active"
    },
    {
      "code": 6001,
      "name": "marketAlreadySettled",
      "msg": "Market is already settled"
    },
    {
      "code": 6002,
      "name": "marketPaused",
      "msg": "Market is paused"
    },
    {
      "code": 6003,
      "name": "marketNotPaused",
      "msg": "Market is not paused"
    },
    {
      "code": 6004,
      "name": "invalidMarket",
      "msg": "Invalid market"
    },
    {
      "code": 6005,
      "name": "invalidProbability",
      "msg": "Invalid probability: must be between 0 and 1"
    },
    {
      "code": 6006,
      "name": "invalidInput",
      "msg": "Invalid input"
    },
    {
      "code": 6007,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6008,
      "name": "invalidOutcome",
      "msg": "Invalid outcome"
    },
    {
      "code": 6009,
      "name": "invalidOutcomeIndex",
      "msg": "Invalid outcome index"
    },
    {
      "code": 6010,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6011,
      "name": "invalidAccountInput",
      "msg": "Invalid account input"
    },
    {
      "code": 6012,
      "name": "invalidGlobalAccount",
      "msg": "Invalid global account"
    },
    {
      "code": 6013,
      "name": "invalidUsdcMint",
      "msg": "Invalid USDC mint"
    },
    {
      "code": 6014,
      "name": "invalidTokenMint",
      "msg": "Invalid token mint"
    },
    {
      "code": 6015,
      "name": "invalidTokenAccountOwner",
      "msg": "Invalid token account owner"
    },
    {
      "code": 6016,
      "name": "insufficientBalance",
      "msg": "Insufficient balance"
    },
    {
      "code": 6017,
      "name": "insufficientVaultBalance",
      "msg": "Insufficient vault balance"
    },
    {
      "code": 6018,
      "name": "insufficientOutcomeTokens",
      "msg": "Insufficient outcome positions"
    },
    {
      "code": 6019,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6020,
      "name": "missingReferenceAgent",
      "msg": "Missing reference agent"
    },
    {
      "code": 6021,
      "name": "missingLastTradeOutcome",
      "msg": "Missing last trade outcome"
    },
    {
      "code": 6022,
      "name": "invalidSwitchboardOracle",
      "msg": "Invalid Switchboard oracle"
    },
    {
      "code": 6023,
      "name": "switchboardUpdateRequired",
      "msg": "Switchboard oracle update required"
    },
    {
      "code": 6024,
      "name": "invalidFeeRate",
      "msg": "Invalid fee rate"
    },
    {
      "code": 6025,
      "name": "invalidFeeConfiguration",
      "msg": "Invalid fee rate configuration"
    },
    {
      "code": 6026,
      "name": "feeTooHigh",
      "msg": "Fee rate too high"
    },
    {
      "code": 6027,
      "name": "invalidSignature",
      "msg": "Invalid signature"
    },
    {
      "code": 6028,
      "name": "marketTerminated",
      "msg": "Market has been terminated"
    },
    {
      "code": 6029,
      "name": "marketNotTerminated",
      "msg": "Market not terminated yet"
    },
    {
      "code": 6030,
      "name": "redemptionNotAllowed",
      "msg": "Redemption not allowed"
    },
    {
      "code": 6031,
      "name": "insufficientOutcomeTokensForRedemption",
      "msg": "Insufficient outcome positions for redemption"
    },
    {
      "code": 6032,
      "name": "tradingPaused",
      "msg": "Trading is paused"
    },
    {
      "code": 6033,
      "name": "notOperator",
      "msg": "Not an operator"
    },
    {
      "code": 6034,
      "name": "notAdmin",
      "msg": "Not an admin"
    },
    {
      "code": 6035,
      "name": "maxOperatorsReached",
      "msg": "Maximum operators reached"
    },
    {
      "code": 6036,
      "name": "alreadyOperator",
      "msg": "Already an operator"
    },
    {
      "code": 6037,
      "name": "operatorNotFound",
      "msg": "Operator not found"
    },
    {
      "code": 6038,
      "name": "orderExpired",
      "msg": "Order expired"
    },
    {
      "code": 6039,
      "name": "orderNotFillable",
      "msg": "Order not fillable (already filled or cancelled)"
    },
    {
      "code": 6040,
      "name": "invalidNonce",
      "msg": "Invalid nonce"
    },
    {
      "code": 6041,
      "name": "notCrossing",
      "msg": "Orders not crossing (prices don't match)"
    },
    {
      "code": 6042,
      "name": "invalidTaker",
      "msg": "Invalid taker (order restricted to specific taker)"
    },
    {
      "code": 6043,
      "name": "invalidOrderSigner",
      "msg": "Invalid order signer"
    },
    {
      "code": 6044,
      "name": "mismatchedTokenIds",
      "msg": "Token ID mismatch"
    },
    {
      "code": 6045,
      "name": "invalidComplement",
      "msg": "Invalid complement tokens"
    },
    {
      "code": 6046,
      "name": "orderHashMismatch",
      "msg": "Order hash mismatch"
    },
    {
      "code": 6047,
      "name": "fillAmountExceedsRemaining",
      "msg": "Fill amount exceeds remaining"
    },
    {
      "code": 6048,
      "name": "notOrderMaker",
      "msg": "Cannot cancel: not order maker"
    },
    {
      "code": 6049,
      "name": "orderAlreadyCancelledOrFilled",
      "msg": "Order already cancelled or filled"
    }
  ],
  "types": [
    {
      "name": "addOperatorParams",
      "docs": [
        "Parameters for add_operator instruction"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "cancelOrderParams",
      "docs": [
        "Parameters for cancel_order instruction"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "docs": [
              "The order to cancel"
            ],
            "type": {
              "defined": {
                "name": "order"
              }
            }
          }
        ]
      }
    },
    {
      "name": "createMarketParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "question",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "yesDescription",
            "type": "string"
          },
          {
            "name": "noDescription",
            "type": "string"
          },
          {
            "name": "marketId",
            "docs": [
              "Unique market identifier (per creator)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "ctfTokensRedeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "winningOutcome",
            "docs": [
              "Outcome redeemed (0: YES, 1: NO)"
            ],
            "type": "u8"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "rewardAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "depositUsdcParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "distributeLiquidityRewardParams",
      "docs": [
        "Distribute liquidity reward to a recipient (admin only)"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "docs": [
              "Amount to distribute (in USDC lamports)"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "fillOrderParams",
      "docs": [
        "Parameters for fill_order instruction"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "signedOrder",
            "docs": [
              "Signed order from maker"
            ],
            "type": {
              "defined": {
                "name": "signedOrder"
              }
            }
          },
          {
            "name": "fillAmount",
            "docs": [
              "Amount to fill (in maker_amount units)"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "global",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "docs": [
              "Keeper wallet for automated tasks (terminating inactive markets)",
              "Can be set to a different wallet than authority for separation of concerns",
              "If set to Pubkey::default(), only authority can perform keeper tasks"
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "platformTreasuryBump",
            "type": "u8"
          },
          {
            "name": "totalTradingFeesCollected",
            "type": "u64"
          },
          {
            "name": "totalCreationFeesCollected",
            "type": "u64"
          },
          {
            "name": "centerTakerFeeRate",
            "docs": [
              "Center taker fee rate at 50% price (scaled by 10^6, e.g., 32000 = 3.2%)",
              "This is the MAXIMUM fee rate at 50-50 odds",
              "Default: 32000 (3.2%)"
            ],
            "type": "u32"
          },
          {
            "name": "extremeTakerFeeRate",
            "docs": [
              "Extreme taker fee rate at 0%/100% price (scaled by 10^6, e.g., 2000 = 0.2%)",
              "This is the MINIMUM fee rate, encouraging arbitrage and high-frequency trading",
              "Default: 2000 (0.2%)"
            ],
            "type": "u32"
          },
          {
            "name": "platformFeeRate",
            "docs": [
              "Platform fee share (scaled by 10^6, e.g., 750000 = 75%)",
              "Portion of taker fees sent to platform treasury"
            ],
            "type": "u32"
          },
          {
            "name": "makerRebateRate",
            "docs": [
              "Maker rebate rate (scaled by 10^6, e.g., 200000 = 20%)",
              "Portion of taker fees sent to rewards treasury (for liquidity providers)"
            ],
            "type": "u32"
          },
          {
            "name": "creatorIncentiveRate",
            "docs": [
              "Creator incentive rate (scaled by 10^6, e.g., 50000 = 5%)",
              "Portion of taker fees sent to market creator"
            ],
            "type": "u32"
          },
          {
            "name": "tradingPaused",
            "docs": [
              "Global trading pause flag",
              "When true, no trading operations (fill_order, match_orders) are allowed"
            ],
            "type": "bool"
          },
          {
            "name": "operatorCount",
            "docs": [
              "Number of active operators"
            ],
            "type": "u8"
          },
          {
            "name": "operators",
            "docs": [
              "List of operator addresses (authorized to execute trades)",
              "Operators can call fill_order and match_orders",
              "Max 10 operators"
            ],
            "type": {
              "array": [
                "pubkey",
                10
              ]
            }
          }
        ]
      }
    },
    {
      "name": "globalFeeRatesUpdated",
      "docs": [
        "Global fee rates updated event",
        "",
        "Emitted when admin updates platform-wide fee configuration.",
        "All markets read from Global account, so changes take effect immediately."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updatedBy",
            "docs": [
              "Admin who updated"
            ],
            "type": "pubkey"
          },
          {
            "name": "centerTakerFeeRate",
            "docs": [
              "Center taker fee rate (at 50% probability)"
            ],
            "type": "u32"
          },
          {
            "name": "extremeTakerFeeRate",
            "docs": [
              "Extreme taker fee rate (at 0%/100% probability)"
            ],
            "type": "u32"
          },
          {
            "name": "platformFeeRate",
            "docs": [
              "Platform fee share"
            ],
            "type": "u32"
          },
          {
            "name": "makerRebateRate",
            "docs": [
              "Maker rebate rate"
            ],
            "type": "u32"
          },
          {
            "name": "creatorIncentiveRate",
            "docs": [
              "Creator incentive rate"
            ],
            "type": "u32"
          },
          {
            "name": "updatedAt",
            "docs": [
              "Update timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "globalTradingPaused",
      "docs": [
        "Global trading paused event"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pausedBy",
            "docs": [
              "Admin who paused"
            ],
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "docs": [
              "Timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "globalTradingUnpaused",
      "docs": [
        "Global trading unpaused event"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "unpausedBy",
            "docs": [
              "Admin who unpaused"
            ],
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "docs": [
              "Timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "initializeParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "docs": [
              "Optional keeper wallet for automated tasks. If None, defaults to authority."
            ],
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "liquidityRewardDistributed",
      "docs": [
        "Liquidity reward distribution event"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "distributedBy",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "distributedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "global",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "docs": [
              "Unique market identifier (per creator)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "question",
            "docs": [
              "Market question"
            ],
            "type": "string"
          },
          {
            "name": "description",
            "docs": [
              "Market description (long form)"
            ],
            "type": "string"
          },
          {
            "name": "yesDescription",
            "docs": [
              "YES outcome description"
            ],
            "type": "string"
          },
          {
            "name": "noDescription",
            "docs": [
              "NO outcome description"
            ],
            "type": "string"
          },
          {
            "name": "createdAt",
            "docs": [
              "Market creation timestamp (unix seconds)"
            ],
            "type": "i64"
          },
          {
            "name": "lastActivityTs",
            "docs": [
              "Last market activity timestamp (unix seconds)",
              "Updated on each order/swap; used for inactivity-based termination."
            ],
            "type": "i64"
          },
          {
            "name": "status",
            "docs": [
              "Market status:",
              "0: Active - market is active and trading",
              "1: Settled - market has been settled (outcome determined)",
              "4: Terminated - market terminated due to inactivity (7 days)"
            ],
            "type": "u8"
          },
          {
            "name": "switchboardQueue",
            "type": "pubkey"
          },
          {
            "name": "randomnessAccount",
            "docs": [
              "Fixed Switchboard randomness account for this market"
            ],
            "type": "pubkey"
          },
          {
            "name": "totalPositionCollateral",
            "docs": [
              "Total USDC collateral backing YES/NO positions"
            ],
            "type": "u64"
          },
          {
            "name": "totalYesSupply",
            "docs": [
              "Total YES supply (1 YES minted per 1 USDC split)"
            ],
            "type": "u64"
          },
          {
            "name": "totalNoSupply",
            "docs": [
              "Total NO supply (1 NO minted per 1 USDC split)"
            ],
            "type": "u64"
          },
          {
            "name": "totalRedeemableUsdc",
            "docs": [
              "Total redeemable USDC locked at settlement/termination"
            ],
            "type": "u64"
          },
          {
            "name": "totalRedeemedUsdc",
            "docs": [
              "Total USDC already redeemed"
            ],
            "type": "u64"
          },
          {
            "name": "lastTradeOutcome",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "referenceAgent",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "totalTrades",
            "type": "u64"
          },
          {
            "name": "lastTradeSlot",
            "docs": [
              "Last observed trade/order slot (best-effort; may be None for brand-new markets)"
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "lastTradeYesPrice",
            "docs": [
              "Last observed YES price (scaled by 10^6, 0-1_000_000)"
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "lastTradeNoPrice",
            "docs": [
              "Last observed NO price (scaled by 10^6, 0-1_000_000)"
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "randomTerminationEnabled",
            "docs": [
              "Whether random termination is enabled (enabled by default)"
            ],
            "type": "bool"
          },
          {
            "name": "terminationProbability",
            "docs": [
              "Termination probability per trade (scaled by 10^6, e.g., 1000 = 0.1%)"
            ],
            "type": "u32"
          },
          {
            "name": "isRandomlyTerminated",
            "docs": [
              "Whether market has been randomly terminated"
            ],
            "type": "bool"
          },
          {
            "name": "finalYesPrice",
            "docs": [
              "Final YES price when terminated (scaled by 10^6)"
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "finalNoPrice",
            "docs": [
              "Final NO price when terminated (scaled by 10^6)"
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "canRedeem",
            "docs": [
              "Can users redeem tokens (after termination)"
            ],
            "type": "bool"
          },
          {
            "name": "terminationTradeSlot",
            "docs": [
              "Trade that triggered termination"
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "tradeNonce",
            "docs": [
              "Trade nonce - incremented on each trade that opts for VRF check",
              "Used to ensure unique randomness: hash(vrf_value, market, user, nonce, slot)"
            ],
            "type": "u64"
          },
          {
            "name": "creatorIncentiveAccrued",
            "docs": [
              "Accrued creator incentive amount (USDC lamports)",
              "Tracks 5% of taker fees allocated to market creator"
            ],
            "type": "u64"
          },
          {
            "name": "isPaused",
            "docs": [
              "Whether market is paused by admin (emergency stop)"
            ],
            "type": "bool"
          },
          {
            "name": "pausedAt",
            "docs": [
              "Timestamp when market was paused"
            ],
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "question",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "yesDescription",
            "type": "string"
          },
          {
            "name": "noDescription",
            "type": "string"
          },
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketCreationFeeCollected",
      "docs": [
        "Market creation fee collection event",
        "",
        "Triggered when creator creates a new market",
        "Records 10 USDC market creation fee"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market address"
            ],
            "type": "pubkey"
          },
          {
            "name": "creator",
            "docs": [
              "Market creator"
            ],
            "type": "pubkey"
          },
          {
            "name": "feeAmount",
            "docs": [
              "Creation fee amount (USDC, scaled by 10^6)"
            ],
            "type": "u64"
          },
          {
            "name": "slot",
            "docs": [
              "Transaction slot"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Transaction timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketParamsUpdated",
      "docs": [
        "Market parameters updated (admin)",
        "",
        "Note: Fee rates are now managed globally via GlobalFeeRatesUpdated event.",
        "This event only tracks per-market parameters like termination probability."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "updatedBy",
            "type": "pubkey"
          },
          {
            "name": "terminationProbability",
            "docs": [
              "Termination probability (scaled by 10^6, e.g., 1000 = 0.1%)"
            ],
            "type": "u32"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketPaused",
      "docs": [
        "Market paused event (admin emergency stop)"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market address"
            ],
            "type": "pubkey"
          },
          {
            "name": "pausedBy",
            "docs": [
              "Admin who paused"
            ],
            "type": "pubkey"
          },
          {
            "name": "pausedAt",
            "docs": [
              "Pause timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketResumed",
      "docs": [
        "Market resumed event (admin re-enable)"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market address"
            ],
            "type": "pubkey"
          },
          {
            "name": "resumedBy",
            "docs": [
              "Admin who resumed"
            ],
            "type": "pubkey"
          },
          {
            "name": "resumedAt",
            "docs": [
              "Resume timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "settlementIndex",
            "type": "u32"
          },
          {
            "name": "winningOutcome",
            "type": "u8"
          },
          {
            "name": "referenceAgent",
            "type": "pubkey"
          },
          {
            "name": "vaultBalance",
            "type": "u64"
          },
          {
            "name": "totalRewards",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketTerminated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "docs": [
              "0 = VRF, 1 = inactivity"
            ],
            "type": "u8"
          },
          {
            "name": "finalYesPrice",
            "docs": [
              "Final YES price (scaled by 10^6)"
            ],
            "type": "u64"
          },
          {
            "name": "finalNoPrice",
            "docs": [
              "Final NO price (scaled by 10^6)"
            ],
            "type": "u64"
          },
          {
            "name": "terminationSlot",
            "docs": [
              "Slot when termination was executed"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Timestamp when termination was executed"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "matchOrdersParams",
      "docs": [
        "Parameters for match_orders instruction"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "takerOrder",
            "docs": [
              "Signed taker order"
            ],
            "type": {
              "defined": {
                "name": "signedOrder"
              }
            }
          },
          {
            "name": "takerFillAmount",
            "docs": [
              "Fill amount for taker order (in maker_amount units)"
            ],
            "type": "u64"
          },
          {
            "name": "makerOrders",
            "docs": [
              "Signed maker orders"
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "signedOrder"
                }
              }
            }
          },
          {
            "name": "makerFillAmounts",
            "docs": [
              "Fill amounts for each maker order"
            ],
            "type": {
              "vec": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "mergePositionSingleParams",
      "docs": [
        "Merge YES and NO positions back to USDC for binary market",
        "",
        "Merge: 1 YES + 1 NO → 1 USDC",
        "User must hold equal amounts of both YES and NO positions"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "docs": [
              "Amount to merge"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "nonceIncremented",
      "docs": [
        "User nonce incremented event",
        "",
        "Emitted when a user increments their nonce to cancel all pending orders"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "docs": [
              "User address"
            ],
            "type": "pubkey"
          },
          {
            "name": "newNonce",
            "docs": [
              "New nonce value"
            ],
            "type": "u64"
          },
          {
            "name": "slot",
            "docs": [
              "Transaction slot"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Transaction timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "operatorAdded",
      "docs": [
        "Operator added event"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "docs": [
              "New operator address"
            ],
            "type": "pubkey"
          },
          {
            "name": "addedBy",
            "docs": [
              "Added by admin"
            ],
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "docs": [
              "Timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "operatorRemoved",
      "docs": [
        "Operator removed event"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "docs": [
              "Removed operator address"
            ],
            "type": "pubkey"
          },
          {
            "name": "removedBy",
            "docs": [
              "Removed by admin"
            ],
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "docs": [
              "Timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "order",
      "docs": [
        "Order structure for atomic swaps",
        "Matches Polymarket CTF Exchange order format"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "salt",
            "docs": [
              "Unique entropy value (prevents hash collision for identical params)"
            ],
            "type": "u64"
          },
          {
            "name": "maker",
            "docs": [
              "Order creator (fund source)"
            ],
            "type": "pubkey"
          },
          {
            "name": "signer",
            "docs": [
              "Signature signer (can differ from maker for proxy wallets)"
            ],
            "type": "pubkey"
          },
          {
            "name": "taker",
            "docs": [
              "Specific taker address (Pubkey::default() = public order)"
            ],
            "type": "pubkey"
          },
          {
            "name": "market",
            "docs": [
              "Market PDA"
            ],
            "type": "pubkey"
          },
          {
            "name": "tokenId",
            "docs": [
              "Token ID: 0=USDC, 1=YES, 2=NO"
            ],
            "type": "u8"
          },
          {
            "name": "makerAmount",
            "docs": [
              "Amount maker provides"
            ],
            "type": "u64"
          },
          {
            "name": "takerAmount",
            "docs": [
              "Amount maker expects to receive"
            ],
            "type": "u64"
          },
          {
            "name": "expiration",
            "docs": [
              "Expiration timestamp (0 = never expires)"
            ],
            "type": "i64"
          },
          {
            "name": "nonce",
            "docs": [
              "User nonce (for batch cancellation via increment_nonce)"
            ],
            "type": "u64"
          },
          {
            "name": "feeRateBps",
            "docs": [
              "Fee rate in basis points (max 1000 = 10%)"
            ],
            "type": "u16"
          },
          {
            "name": "side",
            "docs": [
              "Side: 0=BUY, 1=SELL"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "orderCancelled",
      "docs": [
        "Order cancelled event",
        "",
        "Emitted when an order is cancelled by the maker"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderHash",
            "docs": [
              "Order hash (32-byte keccak256)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "maker",
            "docs": [
              "Maker address (order creator who cancelled)"
            ],
            "type": "pubkey"
          },
          {
            "name": "market",
            "docs": [
              "Market address"
            ],
            "type": "pubkey"
          },
          {
            "name": "slot",
            "docs": [
              "Transaction slot"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Transaction timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderFilled",
      "docs": [
        "Order filled event (single order fill)",
        "",
        "Emitted when an order is partially or fully filled"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderHash",
            "docs": [
              "Order hash (32-byte keccak256)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "maker",
            "docs": [
              "Maker address (order creator)"
            ],
            "type": "pubkey"
          },
          {
            "name": "taker",
            "docs": [
              "Taker address (order filler / operator)"
            ],
            "type": "pubkey"
          },
          {
            "name": "makerAssetId",
            "docs": [
              "Maker asset ID (token_id of asset maker provides)"
            ],
            "type": "u8"
          },
          {
            "name": "takerAssetId",
            "docs": [
              "Taker asset ID (token_id of asset taker provides)"
            ],
            "type": "u8"
          },
          {
            "name": "makerAmountFilled",
            "docs": [
              "Maker amount filled"
            ],
            "type": "u64"
          },
          {
            "name": "takerAmountFilled",
            "docs": [
              "Taker amount filled"
            ],
            "type": "u64"
          },
          {
            "name": "fee",
            "docs": [
              "Fee charged (in proceeds token)"
            ],
            "type": "u64"
          },
          {
            "name": "market",
            "docs": [
              "Market address"
            ],
            "type": "pubkey"
          },
          {
            "name": "slot",
            "docs": [
              "Transaction slot"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Transaction timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderStatus",
      "docs": [
        "Order status tracking for partial fills",
        "",
        "Each order has a corresponding OrderStatus PDA that tracks:",
        "- Whether the order is filled or cancelled",
        "- Remaining amount that can still be filled",
        "",
        "This enables partial fills where an order can be matched multiple times",
        "until fully filled."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderHash",
            "docs": [
              "Order hash (32-byte keccak256 hash)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isFilledOrCancelled",
            "docs": [
              "Whether the order is fully filled or cancelled"
            ],
            "type": "bool"
          },
          {
            "name": "remaining",
            "docs": [
              "Remaining maker amount that can still be filled",
              "Initialized to order.maker_amount on first fill",
              "Decremented on each partial fill"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "ordersMatched",
      "docs": [
        "Orders matched event",
        "",
        "Emitted when a taker order is matched against one or more maker orders"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "takerOrderHash",
            "docs": [
              "Taker order hash"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "takerMaker",
            "docs": [
              "Taker address (taker order maker)"
            ],
            "type": "pubkey"
          },
          {
            "name": "makerAssetId",
            "docs": [
              "Maker asset ID"
            ],
            "type": "u8"
          },
          {
            "name": "takerAssetId",
            "docs": [
              "Taker asset ID"
            ],
            "type": "u8"
          },
          {
            "name": "makerAmountFilled",
            "docs": [
              "Total maker amount filled"
            ],
            "type": "u64"
          },
          {
            "name": "takerAmountFilled",
            "docs": [
              "Total taker amount filled"
            ],
            "type": "u64"
          },
          {
            "name": "makerOrdersCount",
            "docs": [
              "Number of maker orders matched"
            ],
            "type": "u8"
          },
          {
            "name": "market",
            "docs": [
              "Market address"
            ],
            "type": "pubkey"
          },
          {
            "name": "slot",
            "docs": [
              "Transaction slot"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Transaction timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "platformFeesWithdrawn",
      "docs": [
        "Platform fees withdrawn event"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "recipient",
            "docs": [
              "Recipient address"
            ],
            "type": "pubkey"
          },
          {
            "name": "withdrawnBy",
            "docs": [
              "Withdrawn by admin"
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Amount withdrawn (USDC lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "withdrawnAt",
            "docs": [
              "Withdrawal timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "positionMerged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "yesAmount",
            "type": "u64"
          },
          {
            "name": "noAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "positionSplit",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "yesAmount",
            "type": "u64"
          },
          {
            "name": "noAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "redeemSingleOutcomeParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "questionIndex",
            "docs": [
              "Question index (always 0 for binary markets)"
            ],
            "type": "u8"
          },
          {
            "name": "outcomeType",
            "docs": [
              "Outcome type: 0 = YES, 1 = NO"
            ],
            "type": "u8"
          },
          {
            "name": "tokenAmount",
            "docs": [
              "Amount of outcome positions to redeem"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "removeOperatorParams",
      "docs": [
        "Parameters for remove_operator instruction"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "rewardFeesWithdrawn",
      "docs": [
        "Reward fees withdrawn event"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "recipient",
            "docs": [
              "Recipient address"
            ],
            "type": "pubkey"
          },
          {
            "name": "withdrawnBy",
            "docs": [
              "Withdrawn by admin"
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Amount withdrawn (USDC lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "withdrawnAt",
            "docs": [
              "Withdrawal timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "setKeeperParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newKeeper",
            "docs": [
              "New keeper address. Set to Pubkey::default() to disable separate keeper."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "settleWithRandomnessParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "settlementThreshold",
            "docs": [
              "Random termination threshold (scaled by 10^8, 0-100000000 represents 0%-100%)",
              "Example: 10000000 = 10% probability of triggering termination"
            ],
            "type": "u64"
          },
          {
            "name": "lastTradeYesPrice",
            "docs": [
              "Last trade YES price (scaled by 10^6, 0-1000000)"
            ],
            "type": "u64"
          },
          {
            "name": "lastTradeNoPrice",
            "docs": [
              "Last trade NO price (scaled by 10^6, 0-1000000)"
            ],
            "type": "u64"
          },
          {
            "name": "lastTradeSlot",
            "docs": [
              "Last trade slot"
            ],
            "type": "u64"
          },
          {
            "name": "userOptedTerminationCheck",
            "docs": [
              "Whether user opted to check termination (and paid VRF fee)"
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "signedOrder",
      "docs": [
        "Signed order with Ed25519 signature"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": {
              "defined": {
                "name": "order"
              }
            }
          },
          {
            "name": "signature",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "splitPositionSingleParams",
      "docs": [
        "Split USDC into YES and NO positions for binary market",
        "",
        "Binary market: 1 USDC → 1 YES + 1 NO",
        "User deposits USDC and receives equal amounts of YES and NO positions"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "docs": [
              "Amount of USDC to split"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "terminationCheckResult",
      "docs": [
        "VRF termination check result event",
        "",
        "Emitted EVERY time a user attempts VRF termination check.",
        "Frontend should parse this event to determine if termination was triggered.",
        "",
        "Key fields for frontend:",
        "- `was_terminated`: true if market was terminated, false if continues trading",
        "- `random_value`: the derived unique random value (for verification)",
        "- `threshold`: the termination probability threshold"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market address"
            ],
            "type": "pubkey"
          },
          {
            "name": "user",
            "docs": [
              "User who triggered the check"
            ],
            "type": "pubkey"
          },
          {
            "name": "tradeNonce",
            "docs": [
              "Trade nonce at the time of check (ensures uniqueness)"
            ],
            "type": "u64"
          },
          {
            "name": "randomValue",
            "docs": [
              "The derived unique random value (0 to 100_000_000)"
            ],
            "type": "u64"
          },
          {
            "name": "threshold",
            "docs": [
              "Termination threshold (0 to 100_000_000, e.g., 100_000 = 0.1%)"
            ],
            "type": "u64"
          },
          {
            "name": "wasTerminated",
            "docs": [
              "Whether termination was triggered (random_value < threshold)"
            ],
            "type": "bool"
          },
          {
            "name": "slot",
            "docs": [
              "Slot when check was performed"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Timestamp when check was performed"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tradingFeeCollected",
      "docs": [
        "Trading fee collection event",
        "",
        "Triggered when a trade is settled on-chain",
        "Records trading fee based on dynamic fee curve",
        "",
        "AUDIT FIX v1.2.5: Added maker, taker, outcome_type, side, size fields",
        "for complete trade event tracking needed by off-chain sync"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market address"
            ],
            "type": "pubkey"
          },
          {
            "name": "maker",
            "docs": [
              "Maker address (liquidity provider)"
            ],
            "type": "pubkey"
          },
          {
            "name": "taker",
            "docs": [
              "Taker address (aggressor)"
            ],
            "type": "pubkey"
          },
          {
            "name": "user",
            "docs": [
              "User who paid the trading fee (usually taker)"
            ],
            "type": "pubkey"
          },
          {
            "name": "outcomeType",
            "docs": [
              "Outcome type: 0 = YES, 1 = NO"
            ],
            "type": "u8"
          },
          {
            "name": "side",
            "docs": [
              "Trade side: 0 = BUY, 1 = SELL"
            ],
            "type": "u8"
          },
          {
            "name": "size",
            "docs": [
              "Trade size in lamports"
            ],
            "type": "u64"
          },
          {
            "name": "feeAmount",
            "docs": [
              "Trading fee amount (USDC, scaled by 10^6)"
            ],
            "type": "u64"
          },
          {
            "name": "feeRate",
            "docs": [
              "Fee rate applied (scaled by 10^6, e.g., 32000 = 3.2%)"
            ],
            "type": "u32"
          },
          {
            "name": "price",
            "docs": [
              "Price at execution (scaled by 10^6, e.g., 500000 = 50%)"
            ],
            "type": "u64"
          },
          {
            "name": "slot",
            "docs": [
              "Transaction slot"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Transaction timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "updateFeeRatesParams",
      "docs": [
        "Update global fee rates (admin only)",
        "",
        "Allows admin to adjust the platform-wide fee configuration:",
        "- center_taker_fee_rate: Fee at 50% probability (maximum)",
        "- extreme_taker_fee_rate: Fee at 0%/100% probability (minimum)",
        "- platform_fee_rate: Platform's share of fees",
        "- maker_rebate_rate: Maker's rebate share",
        "- creator_incentive_rate: Creator's incentive share",
        "",
        "All markets read from the Global account, so changes take effect immediately.",
        "",
        "Constraints:",
        "- Fee rates must be between 0 and 10% (0-100,000 scaled by 10^6)",
        "- center_rate must be >= extreme_rate",
        "- platform + maker + creator rates must equal 100% (1,000,000)"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "centerTakerFeeRate",
            "docs": [
              "New center fee rate (at 50% probability, scaled by 10^6)",
              "Example: 32000 = 3.2%"
            ],
            "type": "u32"
          },
          {
            "name": "extremeTakerFeeRate",
            "docs": [
              "New extreme fee rate (at 0%/100% probability, scaled by 10^6)",
              "Example: 2000 = 0.2%"
            ],
            "type": "u32"
          },
          {
            "name": "platformFeeRate",
            "docs": [
              "Platform fee share (scaled by 10^6)",
              "Example: 750000 = 75%"
            ],
            "type": "u32"
          },
          {
            "name": "makerRebateRate",
            "docs": [
              "Maker rebate rate (scaled by 10^6)",
              "Example: 200000 = 20%"
            ],
            "type": "u32"
          },
          {
            "name": "creatorIncentiveRate",
            "docs": [
              "Creator incentive rate (scaled by 10^6)",
              "Example: 50000 = 5%"
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "updateMarketParamsInput",
      "docs": [
        "Update market parameters (admin only)",
        "",
        "Allows admin to adjust per-market settings:",
        "- termination_probability: probability per trade (scaled by 10^6, 1000 = 0.1%)",
        "",
        "Note: Fee rates (platform/maker/creator) are now managed globally via update_fee_rates.",
        "See Global.calculate_taker_fee_rate() for fee calculation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "terminationProbability",
            "docs": [
              "New termination probability (scaled by 10^6, optional)",
              "Example: 1000 = 0.1% per trade"
            ],
            "type": {
              "option": "u32"
            }
          }
        ]
      }
    },
    {
      "name": "userBalance",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "usdcBalance",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "userNonce",
      "docs": [
        "User nonce account for order cancellation",
        "",
        "Nonce-based cancellation mechanism (Polymarket-style):",
        "- Each user has a single nonce value",
        "- Orders with nonce < current_nonce are considered cancelled",
        "- User can increment nonce to cancel all pending orders at once",
        "- Individual orders can also be cancelled via cancel_order instruction"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "docs": [
              "User's public key"
            ],
            "type": "pubkey"
          },
          {
            "name": "currentNonce",
            "docs": [
              "Current valid nonce",
              "Orders with nonce < this value are automatically invalid/cancelled"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "userPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "yesBalance",
            "type": "u64"
          },
          {
            "name": "noBalance",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "withdrawPlatformFeesParams",
      "docs": [
        "Withdraw platform fees (admin only)",
        "",
        "Allows admin to withdraw accumulated trading fees and market creation fees",
        "from the platform treasury to a specified recipient address.",
        "",
        "Safety:",
        "- Only program authority can call this",
        "- Transfers USDC from platform treasury to recipient",
        "- Updates global fee tracking stats"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "docs": [
              "Amount to withdraw (in USDC lamports)"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "withdrawRewardFeesParams",
      "docs": [
        "Withdraw reward treasury funds (admin only)",
        "",
        "Allows admin to transfer USDC from the reward treasury to a recipient."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "docs": [
              "Amount to withdraw (in USDC lamports)"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "withdrawUsdcParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
