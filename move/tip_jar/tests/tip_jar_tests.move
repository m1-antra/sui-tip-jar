#[test_only]
module tip_jar::tip_jar_tests;

use sui::coin;
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
