#[test_only]
module tip_jar::tip_jar_tests;

use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;
use tip_jar::tip_jar::{Self, TipJar, OwnerCap};

const OWNER: address = @0xA;
const FAN: address = @0xB;
const THIEF: address = @0xC;

#[test]
fun tip_then_owner_withdraws() {
    let mut s = ts::begin(OWNER);
    {
        let cap = tip_jar::create(s.ctx());
        transfer::public_transfer(cap, OWNER);
    };

    s.next_tx(FAN);
    {
        let mut jar = s.take_shared<TipJar>();
        let payment = coin::mint_for_testing<SUI>(1_000, s.ctx());
        tip_jar::tip(&mut jar, payment, s.ctx());
        assert!(jar.funds_value() == 1_000);
        assert!(jar.tip_count() == 1);
        assert!(jar.total_direct() == 0);
        ts::return_shared(jar);
    };

    s.next_tx(OWNER);
    {
        let mut jar = s.take_shared<TipJar>();
        let cap = s.take_from_sender<OwnerCap>();
        let payout = tip_jar::withdraw(&mut jar, &cap, 600, s.ctx());
        assert!(payout.value() == 600);
        assert!(jar.funds_value() == 400);
        assert!(jar.total_tipped() == 1_000);
        payout.burn_for_testing();
        s.return_to_sender(cap);
        ts::return_shared(jar);
    };
    s.end();
}

#[test, expected_failure(abort_code = tip_jar::EZeroTip)]
fun zero_tip_rejected() {
    let mut s = ts::begin(OWNER);
    let cap = tip_jar::create(s.ctx());
    transfer::public_transfer(cap, OWNER);

    s.next_tx(FAN);
    let mut jar = s.take_shared<TipJar>();
    let payment = coin::mint_for_testing<SUI>(0, s.ctx());
    tip_jar::tip(&mut jar, payment, s.ctx());
    abort 1337
}

/// The key security test: a cap for jar B must not unlock jar A.
#[test, expected_failure(abort_code = tip_jar::EWrongCap)]
fun cap_from_another_jar_cannot_withdraw() {
    let mut s = ts::begin(OWNER);
    let victim_cap = tip_jar::create(s.ctx());
    let victim_jar_id = victim_cap.jar_id();
    transfer::public_transfer(victim_cap, OWNER);

    s.next_tx(THIEF);
    let thief_cap = tip_jar::create(s.ctx());

    s.next_tx(FAN);
    {
        let mut jar = s.take_shared_by_id<TipJar>(victim_jar_id);
        let payment = coin::mint_for_testing<SUI>(1_000, s.ctx());
        tip_jar::tip(&mut jar, payment, s.ctx());
        ts::return_shared(jar);
    };

    s.next_tx(THIEF);
    let mut jar = s.take_shared_by_id<TipJar>(victim_jar_id);
    let _stolen = tip_jar::withdraw(&mut jar, &thief_cap, 1_000, s.ctx());
    abort 1337
}

/// A fan uses their wallet's plain "Send" to the jar's ID. The coin lands at the
/// jar's address; the owner collects it into the jar, and it is counted.
#[test]
fun owner_collects_coin_sent_directly_to_jar() {
    let mut s = ts::begin(OWNER);
    let cap = tip_jar::create(s.ctx());
    let jar_id = cap.jar_id();
    transfer::public_transfer(cap, OWNER);

    s.next_tx(FAN);
    {
        let payment = coin::mint_for_testing<SUI>(2_500, s.ctx());
        transfer::public_transfer(payment, jar_id.to_address());
    };

    s.next_tx(OWNER);
    {
        let mut jar = s.take_shared_by_id<TipJar>(jar_id);
        let cap = s.take_from_sender<OwnerCap>();
        assert!(jar.funds_value() == 0);
        let ticket = ts::most_recent_receiving_ticket<Coin<SUI>>(&jar_id);
        tip_jar::collect_coin_deposit(&mut jar, &cap, ticket, s.ctx());
        assert!(jar.funds_value() == 2_500);
        assert!(jar.total_tipped() == 2_500);
        assert!(jar.total_direct() == 2_500);
        assert!(jar.tip_count() == 0);
        s.return_to_sender(cap);
        ts::return_shared(jar);
    };
    s.end();
}

/// Collecting is owner-only: another jar's cap cannot pull deposits in.
#[test, expected_failure(abort_code = tip_jar::EWrongCap)]
fun collect_with_wrong_cap_fails() {
    let mut s = ts::begin(OWNER);
    let cap = tip_jar::create(s.ctx());
    let jar_id = cap.jar_id();
    transfer::public_transfer(cap, OWNER);

    s.next_tx(THIEF);
    let thief_cap = tip_jar::create(s.ctx());

    s.next_tx(FAN);
    {
        let payment = coin::mint_for_testing<SUI>(2_500, s.ctx());
        transfer::public_transfer(payment, jar_id.to_address());
    };

    s.next_tx(THIEF);
    let mut jar = s.take_shared_by_id<TipJar>(jar_id);
    let ticket = ts::most_recent_receiving_ticket<Coin<SUI>>(&jar_id);
    tip_jar::collect_coin_deposit(&mut jar, &thief_cap, ticket, s.ctx());
    abort 1337
}
