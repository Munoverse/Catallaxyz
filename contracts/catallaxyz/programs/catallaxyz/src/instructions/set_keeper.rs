use anchor_lang::prelude::*;
use crate::constants::GLOBAL_SEED;
use crate::errors::TerminatorError;
use crate::states::global::Global;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetKeeperParams {
    /// New keeper address. Set to Pubkey::default() to disable separate keeper.
    pub new_keeper: Pubkey,
}

#[derive(Accounts)]
pub struct SetKeeper<'info> {
    /// Global authority (admin only)
    #[account(
        constraint = authority.key() == global.authority @ TerminatorError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump
    )]
    pub global: Account<'info, Global>,
}

pub fn handler(ctx: Context<SetKeeper>, params: SetKeeperParams) -> Result<()> {
    let global = &mut ctx.accounts.global;
    global.keeper = params.new_keeper;
    
    msg!("Keeper updated to: {}", params.new_keeper);
    
    Ok(())
}
