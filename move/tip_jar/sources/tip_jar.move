/// A shared tip jar anyone can pay into, where only the holder of the
/// matching `OwnerCap` can withdraw.
///
/// Ownership model:
/// - `TipJar`   -> shared object (anyone can pass `&mut TipJar` to `tip`)
/// - `OwnerCap` -> owned object (only its owner can put it in a transaction)
module tip_jar::tip_jar;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;

// === Errors ===

const EZeroTip: u64 = 0;
const EWrongCap: u64 = 1;
const EInsufficientFunds: u64 = 2;

// === Objects ===

public struct TipJar has key {
    id: UID,
    funds: Balance<SUI>,
    total_tipped: u64,
    tip_count: u64,
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

public fun jar_id(cap: &OwnerCap): ID { cap.jar_id }
