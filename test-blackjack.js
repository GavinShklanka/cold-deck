/*
  Cold Deck Casino. Blackjack engine + side-bet test runner.
  Run with: node test-blackjack.js
  Exit code 0 on ALL GREEN, 1 on any failure.
*/
'use strict';

const BJ = require('./blackjack-core.js');

let failures = 0;
const failureLog = [];

function fail(msg) { failures++; failureLog.push(msg); console.log('  FAIL: ' + msg); }
function eq(actual, expected, msg) {
  if (actual !== expected) fail(msg + ' (got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected) + ')');
}
function ok(cond, msg) { if (!cond) fail(msg); }

console.log('Cold Deck Casino: blackjack-core test suite');
console.log('-------------------------------------------');

// ---------- 1. handValue unit checks ----------
console.log('1) handValue unit checks');
function c(rank, suit) { return { rank: rank, suit: suit || 'S', deck: 0 }; }
const hv = BJ.handValue;

let v;
v = hv([c('A'), c('K')]);
eq(v.total, 21, '(A,K).total === 21');
eq(v.soft,  true, '(A,K).soft === true');

v = hv([c('A'), c('6')]);
eq(v.total, 17, '(A,6).total === 17');
eq(v.soft,  true, '(A,6).soft === true');

v = hv([c('A'), c('6'), c('K')]);
eq(v.total, 17, '(A,6,K).total === 17');
eq(v.soft,  false, '(A,6,K).soft === false');

v = hv([c('10'), c('7'), c('5')]);
eq(v.total, 22, '(10,7,5).total === 22');
ok(v.total > 21, '(10,7,5) busts');

v = hv([c('A'), c('A')]);
eq(v.total, 12, '(A,A).total === 12');
eq(v.soft,  true, '(A,A).soft === true');

console.log('   done.');

// ---------- 1b. Side-bet evaluator unit checks ----------
console.log('');
console.log('1b) Side-bet evaluator unit checks');

const epp = BJ.evaluatePerfectPairs;
const e21 = BJ.evaluate21p3;

// Perfect Pairs: one hand per paytable row.
let pp;
pp = epp(c('10','S'), c('10','S'));
eq(pp.tier, 'perfect', 'PP perfect tier (10S,10S)');
eq(pp.multiplier, 25, 'PP perfect mult 25');

pp = epp(c('10','H'), c('10','D'));
eq(pp.tier, 'colored', 'PP colored tier (10H,10D both red)');
eq(pp.multiplier, 12, 'PP colored mult 12 (red)');

pp = epp(c('10','S'), c('10','C'));
eq(pp.tier, 'colored', 'PP colored tier (10S,10C both black)');
eq(pp.multiplier, 12, 'PP colored mult 12 (black)');

pp = epp(c('10','S'), c('10','H'));
eq(pp.tier, 'mixed', 'PP mixed tier (10S,10H)');
eq(pp.multiplier, 6, 'PP mixed mult 6');

pp = epp(c('K','H'), c('K','S'));
eq(pp.tier, 'mixed', 'PP mixed tier (KH,KS)');
eq(pp.multiplier, 6, 'PP mixed mult 6');

pp = epp(c('10','S'), c('9','S'));
eq(pp.tier, 'none', 'PP none tier (10S,9S)');
eq(pp.multiplier, 0, 'PP none mult 0');

// 21+3: one hand per paytable row.
let t;
t = e21(c('A','S'), c('A','S'), c('A','S'));
eq(t.tier, 'suited-trips', '21+3 suited trips (A,A,A all spades)');
eq(t.multiplier, 100, '21+3 suited-trips mult 100');

t = e21(c('5','H'), c('6','H'), c('7','H'));
eq(t.tier, 'straight-flush', '21+3 straight flush (5-6-7 hearts)');
eq(t.multiplier, 40, '21+3 straight-flush mult 40');

t = e21(c('A','H'), c('2','H'), c('3','H'));
eq(t.tier, 'straight-flush', '21+3 ace-low straight-flush (A-2-3 hearts)');
eq(t.multiplier, 40, '21+3 ace-low SF mult 40');

t = e21(c('Q','S'), c('K','H'), c('A','C'));
eq(t.tier, 'straight', '21+3 ace-high straight (Q-K-A mixed)');
eq(t.multiplier, 10, '21+3 straight mult 10');

t = e21(c('K','S'), c('K','H'), c('K','D'));
eq(t.tier, 'three-of-a-kind', '21+3 trips offsuit (K,K,K mixed)');
eq(t.multiplier, 30, '21+3 trips mult 30');

t = e21(c('5','S'), c('6','H'), c('7','D'));
eq(t.tier, 'straight', '21+3 straight mixed (5-6-7)');
eq(t.multiplier, 10, '21+3 straight mult 10');

t = e21(c('2','S'), c('7','S'), c('K','S'));
eq(t.tier, 'flush', '21+3 flush (2,7,K all spades, no straight)');
eq(t.multiplier, 5, '21+3 flush mult 5');

t = e21(c('2','C'), c('4','D'), c('9','H'));
eq(t.tier, 'none', '21+3 nothing');
eq(t.multiplier, 0, '21+3 none mult 0');

// Paytable constant sanity (test the published numbers, not implementation paths).
eq(BJ.PERFECT_PAIRS_PAYTABLE['perfect'], 25, 'PERFECT_PAIRS perfect = 25');
eq(BJ.PERFECT_PAIRS_PAYTABLE['colored'], 12, 'PERFECT_PAIRS colored = 12');
eq(BJ.PERFECT_PAIRS_PAYTABLE['mixed'],    6, 'PERFECT_PAIRS mixed   = 6');
eq(BJ.TWENTY_ONE_PLUS_3_PAYTABLE['suited-trips'],   100, '21+3 suited-trips    = 100');
eq(BJ.TWENTY_ONE_PLUS_3_PAYTABLE['straight-flush'],  40, '21+3 straight-flush  = 40');
eq(BJ.TWENTY_ONE_PLUS_3_PAYTABLE['three-of-a-kind'], 30, '21+3 three-of-a-kind = 30');
eq(BJ.TWENTY_ONE_PLUS_3_PAYTABLE['straight'],        10, '21+3 straight        = 10');
eq(BJ.TWENTY_ONE_PLUS_3_PAYTABLE['flush'],            5, '21+3 flush           = 5');
eq(BJ.INSURANCE_PAYTABLE['insurance-win'],            2, 'insurance win        = 2');

console.log('   done.');

// ---------- 2. Auto-play 2000 random rounds ----------
console.log('');
console.log('2) Auto-play 2000 random rounds with random side-bet stakes');

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260523);
const STARTING_BANKROLL = 1000000000;
const game = BJ.createGame({
  decks: 6,
  penetration: 0.75,
  dealerHitsSoft17: false,
  minBet: 5,
  maxBet: 500,
  bankroll: STARTING_BANKROLL,
  rng: rng,
});

function cardId(card) { return card.deck + ':' + card.suit + ':' + card.rank; }
function isTen(rank) { return rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K'; }

const seenInShoe = new Set();
let lastShoeId = -1;

let rounds = 0;
let totalCardsDealt = 0;
let bjObserved = 0;
let bjVsBjPush = 0;
let shoeShuffles = 0;
let busts = 0;
let splits = 0;
let doubles = 0;
let surrenders = 0;
let insurances = 0;
let ppStaked = 0, ppWon = 0, ppPayout = 0;
let p3Staked = 0, p3Won = 0, p3Payout = 0;

while (rounds < 2000) {
  const bet = 5 + 5 * Math.floor(rng() * 10);
  const ppStake = rng() < 0.5 ? 0 : (1 + Math.floor(rng() * 5));
  const p3Stake = rng() < 0.5 ? 0 : (1 + Math.floor(rng() * 5));
  const totalUpFront = bet + ppStake + p3Stake;
  if (totalUpFront > game.getState().bankroll) {
    fail('bankroll exhausted before 2000 rounds');
    break;
  }

  const bankrollBeforeDeal = game.getState().bankroll;

  let s;
  try {
    s = game.deal({ bet: bet, perfectPairs: ppStake, twentyOnePlus3: p3Stake });
  } catch (e) {
    fail('deal threw round ' + rounds + ': ' + e.message);
    break;
  }

  if (s.shoeId !== lastShoeId) {
    seenInShoe.clear();
    lastShoeId = s.shoeId;
    shoeShuffles++;
  }

  if (s.phase === BJ.PHASE.INSURANCE) {
    if (rng() < 0.125) {
      const stake = s.bet / 2;
      insurances++;
      s = game.takeInsurance(stake);
    } else {
      s = game.takeInsurance(0);
    }
  }

  let safety = 0;
  while (s.phase === BJ.PHASE.PLAYER) {
    safety++;
    if (safety > 200) { fail('player loop runaway round ' + rounds); break; }
    const idx = s.activeHandIndex;
    const legal = game.legalActions(idx);
    if (legal.length === 0) { fail('no legal actions but phase=player round ' + rounds); break; }
    const action = legal[Math.floor(rng() * legal.length)];
    if (action === 'double')    doubles++;
    if (action === 'split')     splits++;
    if (action === 'surrender') surrenders++;
    try { s = game.act(idx, action); }
    catch (e) { fail('act(' + action + ') threw round ' + rounds + ': ' + e.message); break; }
  }

  if (s.phase === BJ.PHASE.DEALER) {
    try { s = game.dealerPlay(); }
    catch (e) { fail('dealerPlay threw round ' + rounds + ': ' + e.message); break; }
  }

  let results;
  try { results = game.settle(); }
  catch (e) { fail('settle threw round ' + rounds + ': ' + e.message); break; }

  const bankrollAfter = game.getState().bankroll;

  // ---- Bankroll conservation (main bet + insurance + perfectPairs + 21+3) ----
  let totalStaked = 0;
  for (let i = 0; i < s.hands.length; i++) totalStaked += s.hands[i].bet;
  totalStaked += s.insuranceStake;
  totalStaked += s.sideBetStakes.perfectPairs;
  totalStaked += s.sideBetStakes.twentyOnePlus3;
  const expectedChange = -totalStaked + results.totalPayout;
  const actualChange = bankrollAfter - bankrollBeforeDeal;
  if (Math.abs(actualChange - expectedChange) > 1e-9) {
    fail('bankroll conservation round ' + rounds + ': expected ' + expectedChange + ', got ' + actualChange);
  }

  if (bankrollAfter < 0) fail('bankroll went negative round ' + rounds + ': ' + bankrollAfter);

  // ---- Side-bet result rows must be present and correctly shaped when staked ----
  const ppRow = (results.sideBets || []).find(function (r) { return r.category === 'perfectPairs'; });
  const p3Row = (results.sideBets || []).find(function (r) { return r.category === 'twentyOnePlus3'; });
  if (ppStake > 0) {
    if (!ppRow) fail('perfectPairs stake placed but no result row, round ' + rounds);
    else {
      if (ppRow.stake !== ppStake) fail('perfectPairs stake mismatch round ' + rounds);
      const winning = ppRow.multiplier > 0;
      const expectedPayout = winning ? ppStake * (ppRow.multiplier + 1) : 0;
      if (ppRow.payout !== expectedPayout) fail('perfectPairs payout mismatch round ' + rounds + ': expected ' + expectedPayout + ', got ' + ppRow.payout);
      ppStaked += ppStake;
      if (winning) { ppWon++; ppPayout += ppRow.payout; }
    }
  } else if (ppRow) {
    fail('perfectPairs result row appeared without a stake, round ' + rounds);
  }
  if (p3Stake > 0) {
    if (!p3Row) fail('twentyOnePlus3 stake placed but no result row, round ' + rounds);
    else {
      if (p3Row.stake !== p3Stake) fail('twentyOnePlus3 stake mismatch round ' + rounds);
      const winning = p3Row.multiplier > 0;
      const expectedPayout = winning ? p3Stake * (p3Row.multiplier + 1) : 0;
      if (p3Row.payout !== expectedPayout) fail('twentyOnePlus3 payout mismatch round ' + rounds + ': expected ' + expectedPayout + ', got ' + p3Row.payout);
      p3Staked += p3Stake;
      if (winning) { p3Won++; p3Payout += p3Row.payout; }
    }
  } else if (p3Row) {
    fail('twentyOnePlus3 result row appeared without a stake, round ' + rounds);
  }

  // ---- Duplicate card check within a single shoe ----
  const allCardsThisRound = [];
  for (let i = 0; i < s.dealer.length; i++) allCardsThisRound.push(s.dealer[i]);
  for (let i = 0; i < s.hands.length; i++) {
    for (let k = 0; k < s.hands[i].cards.length; k++) allCardsThisRound.push(s.hands[i].cards[k]);
  }
  for (let i = 0; i < allCardsThisRound.length; i++) {
    const id = cardId(allCardsThisRound[i]);
    if (seenInShoe.has(id)) fail('duplicate card ' + id + ' within shoeId ' + lastShoeId + ' round ' + rounds);
    seenInShoe.add(id);
  }
  totalCardsDealt += allCardsThisRound.length;

  // ---- Blackjack 3:2 exactly when detected ----
  for (let i = 0; i < s.hands.length; i++) {
    const h = s.hands[i];
    const playerBJ = h.cards.length === 2
      && !h.fromSplit
      && ((h.cards[0].rank === 'A' && isTen(h.cards[1].rank)) || (h.cards[1].rank === 'A' && isTen(h.cards[0].rank)));
    if (!playerBJ) continue;
    bjObserved++;
    const r = results.hands[i];
    const dealerBJ = results.dealerBJ;
    if (dealerBJ) {
      bjVsBjPush++;
      eq(r.outcome, 'push', 'player BJ vs dealer BJ should push, round ' + rounds);
      if (r.payout !== h.bet) fail('player BJ vs dealer BJ payout should be ' + h.bet + ', got ' + r.payout + ' round ' + rounds);
    } else {
      eq(r.outcome, 'blackjack', 'player BJ should be settled as blackjack, round ' + rounds);
      const expected = h.bet * 2.5;
      if (r.payout !== expected) fail('blackjack payout not 3:2 (expected ' + expected + ', got ' + r.payout + ') round ' + rounds);
    }
  }

  for (let i = 0; i < s.hands.length; i++) {
    if (s.hands[i].busted) busts++;
  }

  rounds++;
}

// ---------- 3. Summary ----------
console.log('   rounds played:      ' + rounds);
console.log('   shuffles:           ' + shoeShuffles);
console.log('   cards dealt:        ' + totalCardsDealt);
console.log('   player blackjacks:  ' + bjObserved + ' (vs dealer BJ pushes: ' + bjVsBjPush + ')');
console.log('   busts:              ' + busts);
console.log('   splits:             ' + splits);
console.log('   doubles:            ' + doubles);
console.log('   surrenders:         ' + surrenders);
console.log('   insurance taken:    ' + insurances);
console.log('   perfect pairs:      staked=' + ppStaked + ' wins=' + ppWon + ' payout=' + ppPayout);
console.log('   21+3:               staked=' + p3Staked + ' wins=' + p3Won + ' payout=' + p3Payout);
console.log('   final bankroll:     ' + game.getState().bankroll);
console.log('');

if (failures === 0) {
  console.log('ALL GREEN');
  process.exit(0);
} else {
  console.log(failures + ' FAILURE(S):');
  for (let i = 0; i < failureLog.length && i < 20; i++) console.log('  - ' + failureLog[i]);
  if (failureLog.length > 20) console.log('  (... ' + (failureLog.length - 20) + ' more)');
  process.exit(1);
}
