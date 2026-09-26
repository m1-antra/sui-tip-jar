/// A shared tip jar anyone can pay into, where only the holder of the
/// matching `OwnerCap` can withdraw.
///
/// Money reaches a jar in two ways:
/// - `tip()`, called by this app: counted immediately.
/// - A plain wallet "Send" to the jar's ID: the contract doesn't run, so the
///   funds wait at the jar's address until the owner collects them with
///   `collect_address_deposits` / `collect_coin_deposit`.
///
/// Ownership model:
/// - `TipJar`   -> shared object (anyone can pass `&mut TipJar` to `tip`)
/// - `OwnerCap` -> owned object (only its owner can put it in a transaction)
module tip_jar::tip_jar;

use std::ascii::String;
use std::type_name;
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use sui::sui::SUI;
use sui::transfer::Receiving;

// === Errors ===

const EZeroTip: u64 = 0;
const EWrongCap: u64 = 1;
const EInsufficientFunds: u64 = 2;
const ENothingToCollect: u64 = 3;

// === Objects ===

public struct TipJar has key {
    id: UID,
    funds: Balance<SUI>,
    /// Everything that ever entered the jar: app tips + collected direct deposits.
    total_tipped: u64,
    /// Number of tips made through `tip()`.
    tip_count: u64,
    /// SUI collected from direct wallet sends to the jar's ID.
    total_direct: u64,
}

/// Withdraw rights for exactly one jar. `store` lets the owner transfer
/// or sell the jar's ownership.
public struct OwnerCap has key, store {
    id: UID,
    jar_id: ID,
}

// === Events ===

public struct JarCreated has copy, drop {
    jar_id: ID,
    creator: address,
}

public struct TipReceived has copy, drop {
    jar_id: ID,
    tipper: address,
    amount: u64,
}

public struct DirectDepositCollected has copy, drop {
    jar_id: ID,
    amount: u64,
    by: address,
}

public struct Withdrawn has copy, drop {
    jar_id: ID,
    by: address,
    amount: u64,
}

// === Public functions ===

/// Shares a new jar and returns its cap. The caller's PTB must do something
/// with the cap (usually transfer it to the sender) or the transaction fails,
/// because `OwnerCap` has no `drop`.
public fun create(ctx: &mut TxContext): OwnerCap {
    let jar = TipJar {
        id: object::new(ctx),
        funds: balance::zero(),
        total_tipped: 0,
        tip_count: 0,
        total_direct: 0,
    };
    let jar_id = object::id(&jar);
    event::emit(JarCreated { jar_id, creator: ctx.sender() });
    transfer::share_object(jar);
    OwnerCap { id: object::new(ctx), jar_id }
}

/// Takes the whole `payment` coin. Clients split the exact amount off first
/// (`tx.splitCoins`) so the contract never decides how much to take.
public fun tip(jar: &mut TipJar, payment: Coin<SUI>, ctx: &TxContext) {
    let amount = payment.value();
    assert!(amount > 0, EZeroTip);
    jar.funds.join(payment.into_balance());
    jar.total_tipped = jar.total_tipped + amount;
    jar.tip_count = jar.tip_count + 1;
    event::emit(TipReceived { jar_id: object::id(jar), tipper: ctx.sender(), amount });
}

/// Pulls SUI that wallets sent to the jar's ID (its address balance) into the jar.
/// Only this module can do this, because it needs `&mut` access to the jar's UID.
public fun collect_address_deposits(
    jar: &mut TipJar,
    cap: &OwnerCap,
    amount: u64,
    ctx: &TxContext,
) {
    assert!(cap.jar_id == object::id(jar), EWrongCap);
    assert!(amount > 0, ENothingToCollect);
    let deposit = balance::redeem_funds(balance::withdraw_funds_from_object<SUI>(&mut jar.id, amount));
    record_direct(jar, deposit, ctx);
}

/// Some wallets transfer a whole `Coin` object to the jar's ID instead.
public fun collect_coin_deposit(
    jar: &mut TipJar,
    cap: &OwnerCap,
    coin: Receiving<Coin<SUI>>,
    ctx: &TxContext,
) {
    assert!(cap.jar_id == object::id(jar), EWrongCap);
    let deposit = transfer::public_receive(&mut jar.id, coin).into_balance();
    assert!(deposit.value() > 0, ENothingToCollect);
    record_direct(jar, deposit, ctx);
}

public fun withdraw(
    jar: &mut TipJar,
    cap: &OwnerCap,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SUI> {
    // Owning *an* OwnerCap is not enough: it must be the cap for *this* jar.
    assert!(cap.jar_id == object::id(jar), EWrongCap);
    assert!(amount <= jar.funds.value(), EInsufficientFunds);
    event::emit(Withdrawn { jar_id: object::id(jar), by: ctx.sender(), amount });
    coin::take(&mut jar.funds, amount, ctx)
}

public fun withdraw_all(jar: &mut TipJar, cap: &OwnerCap, ctx: &mut TxContext): Coin<SUI> {
    let amount = jar.funds.value();
    withdraw(jar, cap, amount, ctx)
}

// === Getters ===

public fun funds_value(jar: &TipJar): u64 { jar.funds.value() }

public fun total_tipped(jar: &TipJar): u64 { jar.total_tipped }

public fun tip_count(jar: &TipJar): u64 { jar.tip_count }

public fun total_direct(jar: &TipJar): u64 { jar.total_direct }

public fun jar_id(cap: &OwnerCap): ID { cap.jar_id }

// === Internal ===

fun record_direct(jar: &mut TipJar, deposit: Balance<SUI>, ctx: &TxContext) {
    let amount = deposit.value();
    jar.funds.join(deposit);
    jar.total_tipped = jar.total_tipped + amount;
    jar.total_direct = jar.total_direct + amount;
    event::emit(DirectDepositCollected { jar_id: object::id(jar), amount, by: ctx.sender() });
}

// === Other coins (e.g. USDC) ===
//
// Added in a package upgrade, so `TipJar` itself can't change. Each coin type
// gets its own vault, attached to the jar's UID as a dynamic field keyed by
// `TokenKey<T>`. SUI keeps using the functions above (`ENotAToken` otherwise).

const ENotAToken: u64 = 4;

public struct TokenKey<phantom T> has copy, drop, store {}

public struct TokenVault<phantom T> has store {
    funds: Balance<T>,
    total_tipped: u64,
    tip_count: u64,
    total_direct: u64,
}

public struct TokenTipReceived has copy, drop {
    jar_id: ID,
    coin_type: String,
    tipper: address,
    amount: u64,
}

public struct TokenDepositCollected has copy, drop {
    jar_id: ID,
    coin_type: String,
    amount: u64,
    by: address,
}

public struct TokenWithdrawn has copy, drop {
    jar_id: ID,
    coin_type: String,
    by: address,
    amount: u64,
}

public fun tip_token<T>(jar: &mut TipJar, payment: Coin<T>, ctx: &TxContext) {
    let amount = payment.value();
    assert!(amount > 0, EZeroTip);
    let jar_id = object::id(jar);
    let vault = vault_mut<T>(jar);
    vault.funds.join(payment.into_balance());
    vault.total_tipped = vault.total_tipped + amount;
    vault.tip_count = vault.tip_count + 1;
    event::emit(TokenTipReceived { jar_id, coin_type: coin_type<T>(), tipper: ctx.sender(), amount });
}

public fun collect_token_address_deposits<T>(
    jar: &mut TipJar,
    cap: &OwnerCap,
    amount: u64,
    ctx: &TxContext,
) {
    assert!(cap.jar_id == object::id(jar), EWrongCap);
    assert!(amount > 0, ENothingToCollect);
    let deposit = balance::redeem_funds(balance::withdraw_funds_from_object<T>(&mut jar.id, amount));
    record_token_direct(jar, deposit, ctx);
}

public fun collect_token_coin_deposit<T>(
    jar: &mut TipJar,
    cap: &OwnerCap,
    coin: Receiving<Coin<T>>,
    ctx: &TxContext,
) {
    assert!(cap.jar_id == object::id(jar), EWrongCap);
    let deposit = transfer::public_receive(&mut jar.id, coin).into_balance();
    assert!(deposit.value() > 0, ENothingToCollect);
    record_token_direct(jar, deposit, ctx);
}

public fun withdraw_all_token<T>(jar: &mut TipJar, cap: &OwnerCap, ctx: &mut TxContext): Coin<T> {
    assert!(cap.jar_id == object::id(jar), EWrongCap);
    let jar_id = object::id(jar);
    let vault = vault_mut<T>(jar);
    let amount = vault.funds.value();
    let payout = coin::take(&mut vault.funds, amount, ctx);
    event::emit(TokenWithdrawn { jar_id, coin_type: coin_type<T>(), by: ctx.sender(), amount });
    payout
}

public fun token_funds<T>(jar: &TipJar): u64 {
    if (!df::exists_with_type<TokenKey<T>, TokenVault<T>>(&jar.id, TokenKey<T> {})) return 0;
    df::borrow<TokenKey<T>, TokenVault<T>>(&jar.id, TokenKey<T> {}).funds.value()
}

public fun token_total_tipped<T>(jar: &TipJar): u64 {
    if (!df::exists_with_type<TokenKey<T>, TokenVault<T>>(&jar.id, TokenKey<T> {})) return 0;
    df::borrow<TokenKey<T>, TokenVault<T>>(&jar.id, TokenKey<T> {}).total_tipped
}

/// Creates the coin's vault on first use.
fun vault_mut<T>(jar: &mut TipJar): &mut TokenVault<T> {
    assert!(type_name::with_defining_ids<T>() != type_name::with_defining_ids<SUI>(), ENotAToken);
    if (!df::exists_with_type<TokenKey<T>, TokenVault<T>>(&jar.id, TokenKey<T> {})) {
        let vault = TokenVault<T> { funds: balance::zero(), total_tipped: 0, tip_count: 0, total_direct: 0 };
        df::add(&mut jar.id, TokenKey<T> {}, vault);
    };
    df::borrow_mut(&mut jar.id, TokenKey<T> {})
}

fun record_token_direct<T>(jar: &mut TipJar, deposit: Balance<T>, ctx: &TxContext) {
    let jar_id = object::id(jar);
    let amount = deposit.value();
    let vault = vault_mut<T>(jar);
    vault.funds.join(deposit);
    vault.total_tipped = vault.total_tipped + amount;
    vault.total_direct = vault.total_direct + amount;
    event::emit(TokenDepositCollected { jar_id, coin_type: coin_type<T>(), amount, by: ctx.sender() });
}

fun coin_type<T>(): String {
    type_name::with_defining_ids<T>().into_string()
}
