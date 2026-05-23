/*
  Cold Deck Casino. Blackjack rules engine plus side bets.
  Pure logic. No DOM. No storage. No network.
  Exports via CommonJS (module.exports) and via window.BlackjackCore in a browser.
  Deterministic when an rng is injected (signature: () => float in [0,1)).
*/
'use strict';

(function () {

  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const SUITS = ['S','H','D','C']; // spades, hearts, diamonds, clubs

  const PHASE = {
    BETTING:    'betting',
    INSURANCE:  'insurance',
    PLAYER:     'player',
    DEALER:     'dealer',
    SETTLED:    'settled',
  };

  // ---------- Side-bet paytables (tunable, kept at top of file on purpose) ----------
  // All values are "to 1" odds. A winning tier with multiplier N credits stake * (N + 1)
  // back to the bankroll (stake returned plus N units of profit). Losing tiers credit 0.

  const PERFECT_PAIRS_PAYTABLE = Object.freeze({
    'perfect': 25, // same rank, same suit
    'colored': 12, // same rank, same color, different suit
    'mixed':    6, // same rank, different color
    'none':     0, // no pair, stake forfeited
  });

  const TWENTY_ONE_PLUS_3_PAYTABLE = Object.freeze({
    'suited-trips':    100,
    'straight-flush':   40,
    'three-of-a-kind':  30,
    'straight':         10,
    'flush':             5,
    'none':              0,
  });

  const LUCKY_SEVENS_PAYTABLE = Object.freeze({
    'three-suited':    2000,
    'three-unsuited':   500,
    'two-suited':       100,
    'two-unsuited':      50,
    'one-seven':          3,
    'none':               0,
  });

  const INSURANCE_PAYTABLE = Object.freeze({
    'insurance-win':  2,
    'insurance-loss': 0,
  });

  const RED_SUITS = { H: true, D: true, S: false, C: false };

  // ---------- Side-bet evaluators (pure, no engine state) ----------

  function evaluatePerfectPairs(c1, c2) {
    if (!c1 || !c2 || c1.rank !== c2.rank) {
      return { tier: 'none', multiplier: PERFECT_PAIRS_PAYTABLE['none'] };
    }
    if (c1.suit === c2.suit) {
      return { tier: 'perfect', multiplier: PERFECT_PAIRS_PAYTABLE['perfect'] };
    }
    const sameColor = (RED_SUITS[c1.suit] === RED_SUITS[c2.suit]);
    if (sameColor) {
      return { tier: 'colored', multiplier: PERFECT_PAIRS_PAYTABLE['colored'] };
    }
    return { tier: 'mixed', multiplier: PERFECT_PAIRS_PAYTABLE['mixed'] };
  }

  function evaluateLuckySevens(cards) {
    if (!cards || cards.length === 0 || cards[0].rank !== '7') {
      return { tier: 'none', multiplier: LUCKY_SEVENS_PAYTABLE['none'] };
    }
    if (cards.length === 1) {
      return { tier: 'one-seven', multiplier: LUCKY_SEVENS_PAYTABLE['one-seven'] };
    }
    if (cards.length === 2) {
      if (cards[1].rank !== '7') {
        return { tier: 'one-seven', multiplier: LUCKY_SEVENS_PAYTABLE['one-seven'] };
      }
      const suited = cards[0].suit === cards[1].suit;
      return suited 
        ? { tier: 'two-suited', multiplier: LUCKY_SEVENS_PAYTABLE['two-suited'] }
        : { tier: 'two-unsuited', multiplier: LUCKY_SEVENS_PAYTABLE['two-unsuited'] };
    }
    // cards.length >= 3
    if (cards[1].rank === '7' && cards[2].rank === '7') {
      const suited = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
      return suited
        ? { tier: 'three-suited', multiplier: LUCKY_SEVENS_PAYTABLE['three-suited'] }
        : { tier: 'three-unsuited', multiplier: LUCKY_SEVENS_PAYTABLE['three-unsuited'] };
    }
    if (cards[1].rank === '7') {
      const suited = cards[0].suit === cards[1].suit;
      return suited
        ? { tier: 'two-suited', multiplier: LUCKY_SEVENS_PAYTABLE['two-suited'] }
        : { tier: 'two-unsuited', multiplier: LUCKY_SEVENS_PAYTABLE['two-unsuited'] };
    }
    return { tier: 'one-seven', multiplier: LUCKY_SEVENS_PAYTABLE['one-seven'] };
  }

  function rankOrder(rank) {
    if (rank === 'A') return 14;
    if (rank === 'K') return 13;
    if (rank === 'Q') return 12;
    if (rank === 'J') return 11;
    return parseInt(rank, 10);
  }

  function isStraightThree(c1, c2, c3) {
    const v = [rankOrder(c1.rank), rankOrder(c2.rank), rankOrder(c3.rank)].sort(function (a, b) { return a - b; });
    if (v[2] - v[1] === 1 && v[1] - v[0] === 1) return true;
    if (v.indexOf(14) !== -1) {
      const lo = v.map(function (x) { return x === 14 ? 1 : x; }).sort(function (a, b) { return a - b; });
      if (lo[2] - lo[1] === 1 && lo[1] - lo[0] === 1) return true;
    }
    return false;
  }

  function isFlushThree(c1, c2, c3) {
    return c1.suit === c2.suit && c2.suit === c3.suit;
  }

  function isThreeOfAKind(c1, c2, c3) {
    return c1.rank === c2.rank && c2.rank === c3.rank;
  }

  function evaluate21p3(c1, c2, dealerUp) {
    if (!c1 || !c2 || !dealerUp) {
      return { tier: 'none', multiplier: TWENTY_ONE_PLUS_3_PAYTABLE['none'] };
    }
    const trips = isThreeOfAKind(c1, c2, dealerUp);
    const flush = isFlushThree(c1, c2, dealerUp);
    const straight = isStraightThree(c1, c2, dealerUp);
    if (trips && flush)    return { tier: 'suited-trips',    multiplier: TWENTY_ONE_PLUS_3_PAYTABLE['suited-trips'] };
    if (straight && flush) return { tier: 'straight-flush',  multiplier: TWENTY_ONE_PLUS_3_PAYTABLE['straight-flush'] };
    if (trips)             return { tier: 'three-of-a-kind', multiplier: TWENTY_ONE_PLUS_3_PAYTABLE['three-of-a-kind'] };
    if (straight)          return { tier: 'straight',        multiplier: TWENTY_ONE_PLUS_3_PAYTABLE['straight'] };
    if (flush)             return { tier: 'flush',           multiplier: TWENTY_ONE_PLUS_3_PAYTABLE['flush'] };
    return { tier: 'none', multiplier: TWENTY_ONE_PLUS_3_PAYTABLE['none'] };
  }

  // ---------- Core helpers ----------

  function defaultRng() { return Math.random(); }

  function rankValue(rank) {
    if (rank === 'A') return 1;
    if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
    return parseInt(rank, 10);
  }

  function isTenValue(rank) {
    return rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K';
  }

  function handValue(cards) {
    let total = 0;
    let aces = 0;
    for (let i = 0; i < cards.length; i++) {
      total += rankValue(cards[i].rank);
      if (cards[i].rank === 'A') aces++;
    }
    let soft = false;
    if (aces > 0 && total + 10 <= 21) {
      total += 10;
      soft = true;
    }
    return { total: total, soft: soft };
  }

  function isBlackjack(cards) {
    if (cards.length !== 2) return false;
    const a = cards[0].rank;
    const b = cards[1].rank;
    return (a === 'A' && isTenValue(b)) || (b === 'A' && isTenValue(a));
  }

  function buildShoe(decks) {
    const shoe = [];
    for (let d = 0; d < decks; d++) {
      for (let s = 0; s < SUITS.length; s++) {
        for (let r = 0; r < RANKS.length; r++) {
          shoe.push({ rank: RANKS[r], suit: SUITS[s], deck: d });
        }
      }
    }
    return shoe;
  }

  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function cloneCard(c) { return { rank: c.rank, suit: c.suit, deck: c.deck }; }

  function cloneHand(h) {
    return {
      cards: h.cards.map(cloneCard),
      bet: h.bet,
      doubled: h.doubled,
      surrendered: h.surrendered,
      stand: h.stand,
      busted: h.busted,
      fromSplit: h.fromSplit,
      isSplitAces: h.isSplitAces,
      finished: h.finished,
    };
  }

  // ---------- Game factory ----------

  function createGame(opts) {
    opts = opts || {};
    const config = {
      decks: opts.decks || 6,
      penetration: typeof opts.penetration === 'number' ? opts.penetration : 0.75,
      dealerHitsSoft17: opts.dealerHitsSoft17 === true,
      minBet: typeof opts.minBet === 'number' ? opts.minBet : 5,
      maxBet: typeof opts.maxBet === 'number' ? opts.maxBet : 500,
      bankroll: typeof opts.bankroll === 'number' ? opts.bankroll : 1000,
      rng: typeof opts.rng === 'function' ? opts.rng : defaultRng,
    };

    const state = {
      bankroll: config.bankroll,
      shoe: [],
      discard: [],
      cutIndex: 0,
      needShuffle: true,
      dealer: [],
      dealerHoleHidden: true,
      hands: [],
      activeHandIndex: 0,
      bet: 0,
      insuranceStake: 0,
      sideBetStakes: { perfectPairs: 0, twentyOnePlus3: 0, luckySevens: 0 },
      sideBetEvals:  { perfectPairs: null, twentyOnePlus3: null, luckySevens: null },
      luckySevensCards: [],
      phase: PHASE.BETTING,
      roundResults: null,
      shoeId: 0,
    };

    function newShoe() {
      state.shoe = buildShoe(config.decks);
      shuffleInPlace(state.shoe, config.rng);
      state.discard = [];
      state.cutIndex = Math.floor(state.shoe.length * config.penetration);
      state.needShuffle = false;
      state.shoeId++;
      return state.shoe.length;
    }

    function draw() {
      if (state.shoe.length === 0) newShoe();
      return state.shoe.pop();
    }

    function dealCards(target, n) {
      for (let i = 0; i < n; i++) {
        const c = draw();
        target.push(c);
        if (state.hands && state.hands[0] && target === state.hands[0].cards) {
          if (state.luckySevensCards.length < 3) {
            state.luckySevensCards.push(c);
          }
        }
      }
    }

    function dealtCount() { return config.decks * 52 - state.shoe.length; }

    function maybeFlagShuffle() {
      if (dealtCount() >= state.cutIndex) state.needShuffle = true;
    }

    function deal(arg) {
      if (state.phase !== PHASE.BETTING && state.phase !== PHASE.SETTLED) {
        throw new Error('deal() not legal in phase ' + state.phase);
      }
      let bet, perfectPairs, twentyOnePlus3, luckySevens;
      if (typeof arg === 'number') {
        bet = arg; perfectPairs = 0; twentyOnePlus3 = 0; luckySevens = 0;
      } else if (arg && typeof arg === 'object') {
        bet = arg.bet;
        perfectPairs   = (typeof arg.perfectPairs   === 'number' && arg.perfectPairs   > 0) ? arg.perfectPairs   : 0;
        twentyOnePlus3 = (typeof arg.twentyOnePlus3 === 'number' && arg.twentyOnePlus3 > 0) ? arg.twentyOnePlus3 : 0;
        luckySevens    = (typeof arg.luckySevens    === 'number' && arg.luckySevens    > 0) ? arg.luckySevens    : 0;
      } else {
        throw new Error('deal() expects a number or { bet, perfectPairs, twentyOnePlus3, luckySevens }');
      }

      if (typeof bet !== 'number' || !isFinite(bet)) throw new Error('bet must be a finite number');
      if (bet < config.minBet) throw new Error('bet below min (' + config.minBet + ')');
      if (bet > config.maxBet) throw new Error('bet above max (' + config.maxBet + ')');
      if (perfectPairs   < 0) throw new Error('perfectPairs stake cannot be negative');
      if (twentyOnePlus3 < 0) throw new Error('twentyOnePlus3 stake cannot be negative');
      if (luckySevens    < 0) throw new Error('luckySevens stake cannot be negative');
      if (bet + perfectPairs + twentyOnePlus3 + luckySevens > state.bankroll) {
        throw new Error('total stake exceeds bankroll');
      }

      if (state.needShuffle || state.shoe.length === 0) newShoe();

      state.bankroll -= bet;
      state.bankroll -= perfectPairs;
      state.bankroll -= twentyOnePlus3;
      state.bankroll -= luckySevens;

      state.bet = bet;
      state.insuranceStake = 0;
      state.sideBetStakes = { perfectPairs: perfectPairs, twentyOnePlus3: twentyOnePlus3, luckySevens: luckySevens };
      state.sideBetEvals  = { perfectPairs: null, twentyOnePlus3: null, luckySevens: null };
      state.luckySevensCards = [];
      state.dealer = [];
      state.dealerHoleHidden = true;
      state.hands = [{
        cards: [], bet: bet, doubled: false, surrendered: false,
        stand: false, busted: false, fromSplit: false, isSplitAces: false, finished: false,
      }];
      state.activeHandIndex = 0;
      state.roundResults = null;

      dealCards(state.hands[0].cards, 1);
      dealCards(state.dealer, 1);
      dealCards(state.hands[0].cards, 1);
      dealCards(state.dealer, 1);

      state.sideBetEvals = {
        perfectPairs:   evaluatePerfectPairs(state.hands[0].cards[0], state.hands[0].cards[1]),
        twentyOnePlus3: evaluate21p3(state.hands[0].cards[0], state.hands[0].cards[1], state.dealer[0]),
        luckySevens:    evaluateLuckySevens(state.luckySevensCards),
      };

      const up = state.dealer[0];
      const playerBJ = isBlackjack(state.hands[0].cards);

      if (up.rank === 'A') {
        state.phase = PHASE.INSURANCE;
        return getState();
      }

      if (isTenValue(up.rank)) {
        if (isBlackjack(state.dealer)) {
          state.dealerHoleHidden = false;
          state.phase = PHASE.DEALER;
          finalizeRound();
          return getState();
        }
      }

      if (playerBJ) {
        state.dealerHoleHidden = false;
        state.hands[0].finished = true;
        state.phase = PHASE.DEALER;
        finalizeRound();
        return getState();
      }

      state.phase = PHASE.PLAYER;
      return getState();
    }

    function takeInsurance(stake) {
      if (state.phase !== PHASE.INSURANCE) throw new Error('insurance not on offer');
      if (typeof stake !== 'number' || !isFinite(stake) || stake < 0) stake = 0;
      const cap = state.bet / 2;
      if (stake > cap) stake = cap;
      if (stake > state.bankroll) throw new Error('insurance exceeds bankroll');
      state.bankroll -= stake;
      state.insuranceStake = stake;

      if (isBlackjack(state.dealer)) {
        state.dealerHoleHidden = false;
        state.phase = PHASE.DEALER;
        finalizeRound();
        return getState();
      }
      if (isBlackjack(state.hands[0].cards)) {
        state.dealerHoleHidden = false;
        state.hands[0].finished = true;
        state.phase = PHASE.DEALER;
        finalizeRound();
        return getState();
      }
      state.phase = PHASE.PLAYER;
      return getState();
    }

    function legalActions(handIndex) {
      if (state.phase !== PHASE.PLAYER) return [];
      if (handIndex !== state.activeHandIndex) return [];
      const h = state.hands[handIndex];
      if (!h || h.finished) return [];
      const out = [];
      out.push('hit');
      out.push('stand');
      const firstTwo = h.cards.length === 2 && !h.doubled;
      if (firstTwo && state.bankroll >= h.bet) out.push('double');
      if (firstTwo
          && (h.cards[0].rank === h.cards[1].rank || (isTenValue(h.cards[0].rank) && isTenValue(h.cards[1].rank)))
          && state.hands.length < 4
          && state.bankroll >= h.bet) {
        out.push('split');
      }
      if (firstTwo && !h.fromSplit) out.push('surrender');
      return out;
    }

    function advanceToNextHand() {
      state.activeHandIndex++;
      while (state.activeHandIndex < state.hands.length && state.hands[state.activeHandIndex].finished) {
        state.activeHandIndex++;
      }
      if (state.activeHandIndex >= state.hands.length) {
        state.phase = PHASE.DEALER;
        return;
      }
      const h = state.hands[state.activeHandIndex];
      if (h.cards.length === 1) {
        dealCards(h.cards, 1);
        if (h.isSplitAces) {
          h.finished = true;
          advanceToNextHand();
          return;
        }
        if (handValue(h.cards).total === 21) {
          h.stand = true;
          h.finished = true;
          advanceToNextHand();
        }
      }
    }

    function act(handIndex, action) {
      if (state.phase !== PHASE.PLAYER) throw new Error('act() not legal in phase ' + state.phase);
      if (handIndex !== state.activeHandIndex) throw new Error('not the active hand');
      const h = state.hands[handIndex];
      if (!h || h.finished) throw new Error('hand not actionable');
      const legal = legalActions(handIndex);
      if (legal.indexOf(action) === -1) throw new Error('illegal action: ' + action);

      if (action === 'hit') {
        dealCards(h.cards, 1);
        const v = handValue(h.cards);
        if (v.total > 21) { h.busted = true; h.finished = true; advanceToNextHand(); }
        else if (v.total === 21) { h.stand = true; h.finished = true; advanceToNextHand(); }
      } else if (action === 'stand') {
        h.stand = true; h.finished = true; advanceToNextHand();
      } else if (action === 'double') {
        state.bankroll -= h.bet;
        h.bet *= 2;
        h.doubled = true;
        dealCards(h.cards, 1);
        if (handValue(h.cards).total > 21) h.busted = true;
        h.finished = true;
        advanceToNextHand();
      } else if (action === 'split') {
        const second = h.cards.pop();
        state.bankroll -= h.bet;
        const splitAces = h.cards[0].rank === 'A';
        h.fromSplit = true;
        if (splitAces) h.isSplitAces = true;
        const newHand = {
          cards: [second], bet: h.bet, doubled: false, surrendered: false,
          stand: false, busted: false, fromSplit: true,
          isSplitAces: splitAces, finished: false,
        };
        state.hands.splice(handIndex + 1, 0, newHand);
        dealCards(h.cards, 1);
        if (splitAces) { h.finished = true; advanceToNextHand(); }
        else if (handValue(h.cards).total === 21) {
          h.stand = true; h.finished = true; advanceToNextHand();
        }
      } else if (action === 'surrender') {
        h.surrendered = true; h.finished = true; advanceToNextHand();
      }
      return getState();
    }

    function dealerPlay() {
      if (state.phase !== PHASE.DEALER) throw new Error('dealerPlay() not legal in phase ' + state.phase);
      state.dealerHoleHidden = false;
      const anyAlive = state.hands.some(function (h) { return !h.busted && !h.surrendered; });
      if (anyAlive) {
        while (true) {
          const v = handValue(state.dealer);
          if (v.total < 17) { dealCards(state.dealer, 1); continue; }
          if (v.total === 17 && v.soft && config.dealerHitsSoft17) { dealCards(state.dealer, 1); continue; }
          break;
        }
      }
      finalizeRound();
      return getState();
    }

    function settle() {
      if (state.phase === PHASE.DEALER) finalizeRound();
      if (state.phase !== PHASE.SETTLED) throw new Error('settle() not legal in phase ' + state.phase);
      return state.roundResults;
    }

    function finalizeRound() {
      const dealerBJ = isBlackjack(state.dealer);
      const dealerV = handValue(state.dealer);
      const dealerBust = dealerV.total > 21;

      const handResults = [];
      for (let i = 0; i < state.hands.length; i++) {
        const h = state.hands[i];
        const stake = h.bet;
        const playerV = handValue(h.cards);
        let outcome, payout;

        if (h.surrendered) { outcome = 'surrender'; payout = stake / 2; }
        else if (h.busted) { outcome = 'bust'; payout = 0; }
        else if (isBlackjack(h.cards) && !h.fromSplit) {
          if (dealerBJ) { outcome = 'push'; payout = stake; }
          else { outcome = 'blackjack'; payout = stake + (stake * 3 / 2); }
        } else if (dealerBJ) { outcome = 'loss'; payout = 0; }
        else if (dealerBust) { outcome = 'win'; payout = stake * 2; }
        else if (playerV.total > dealerV.total) { outcome = 'win'; payout = stake * 2; }
        else if (playerV.total < dealerV.total) { outcome = 'loss'; payout = 0; }
        else { outcome = 'push'; payout = stake; }

        handResults.push({
          handIndex: i, outcome: outcome, stake: stake, payout: payout,
          playerTotal: playerV.total, playerSoft: playerV.soft,
          dealerTotal: dealerV.total,
        });
      }

      const sideBets = [];

      if (state.sideBetStakes.perfectPairs > 0) {
        const ev = state.sideBetEvals.perfectPairs;
        const won = ev.multiplier > 0;
        sideBets.push({
          category: 'perfectPairs',
          stake: state.sideBetStakes.perfectPairs,
          outcome: ev.tier,
          multiplier: ev.multiplier,
          payout: won ? state.sideBetStakes.perfectPairs * (ev.multiplier + 1) : 0,
        });
      }

      if (state.sideBetStakes.twentyOnePlus3 > 0) {
        const ev = state.sideBetEvals.twentyOnePlus3;
        const won = ev.multiplier > 0;
        sideBets.push({
          category: 'twentyOnePlus3',
          stake: state.sideBetStakes.twentyOnePlus3,
          outcome: ev.tier,
          multiplier: ev.multiplier,
          payout: won ? state.sideBetStakes.twentyOnePlus3 * (ev.multiplier + 1) : 0,
        });
      }

      if (state.sideBetStakes.luckySevens > 0) {
        const ev = evaluateLuckySevens(state.luckySevensCards);
        const won = ev.multiplier > 0;
        sideBets.push({
          category: 'luckySevens',
          stake: state.sideBetStakes.luckySevens,
          outcome: ev.tier,
          multiplier: ev.multiplier,
          payout: won ? state.sideBetStakes.luckySevens * (ev.multiplier + 1) : 0,
        });
      }

      let insuranceResult = null;
      if (state.insuranceStake > 0) {
        const outcome = dealerBJ ? 'insurance-win' : 'insurance-loss';
        const mult = INSURANCE_PAYTABLE[outcome];
        const payout = dealerBJ ? state.insuranceStake * (mult + 1) : 0;
        insuranceResult = { stake: state.insuranceStake, outcome: outcome, payout: payout };
        sideBets.push({
          category: 'insurance',
          stake: state.insuranceStake,
          outcome: outcome,
          multiplier: mult,
          payout: payout,
        });
      }

      let totalPayout = 0;
      for (let i = 0; i < handResults.length; i++) totalPayout += handResults[i].payout;
      for (let i = 0; i < sideBets.length; i++) totalPayout += sideBets[i].payout;
      state.bankroll += totalPayout;

      for (let i = 0; i < state.dealer.length; i++) state.discard.push(state.dealer[i]);
      for (let i = 0; i < state.hands.length; i++) {
        for (let k = 0; k < state.hands[i].cards.length; k++) {
          state.discard.push(state.hands[i].cards[k]);
        }
      }

      state.roundResults = {
        hands: handResults,
        insurance: insuranceResult,
        sideBets: sideBets,
        totalPayout: totalPayout,
        dealer: state.dealer.map(cloneCard),
        dealerTotal: dealerV.total,
        dealerBJ: dealerBJ,
      };
      state.phase = PHASE.SETTLED;
      maybeFlagShuffle();
    }

     function getState() {
      return {
        phase: state.phase,
        bankroll: state.bankroll,
        bet: state.bet,
        insuranceStake: state.insuranceStake,
        sideBetStakes: {
          perfectPairs:   state.sideBetStakes.perfectPairs,
          twentyOnePlus3: state.sideBetStakes.twentyOnePlus3,
          luckySevens:    state.sideBetStakes.luckySevens,
        },
        dealer: state.dealer.map(cloneCard),
        dealerHoleHidden: state.dealerHoleHidden,
        hands: state.hands.map(cloneHand),
        activeHandIndex: state.activeHandIndex,
        shoeRemaining: state.shoe.length,
        shoeId: state.shoeId,
        needShuffle: state.needShuffle,
        cutIndex: state.cutIndex,
        results: state.roundResults,
        luckySevensCards: state.luckySevensCards ? state.luckySevensCards.map(cloneCard) : [],
        config: {
          decks: config.decks,
          penetration: config.penetration,
          dealerHitsSoft17: config.dealerHitsSoft17,
          minBet: config.minBet,
          maxBet: config.maxBet,
        },
      };
    }

    return {
      newShoe: newShoe,
      deal: deal,
      takeInsurance: takeInsurance,
      legalActions: legalActions,
      act: act,
      dealerPlay: dealerPlay,
      settle: settle,
      getState: getState,
    };
  }

  const api = {
    createGame: createGame,
    handValue: handValue,
    isBlackjack: isBlackjack,
    isTenValue: isTenValue,
    rankValue: rankValue,
    buildShoe: buildShoe,
    shuffleInPlace: shuffleInPlace,
    evaluatePerfectPairs: evaluatePerfectPairs,
    evaluate21p3: evaluate21p3,
    evaluateLuckySevens: evaluateLuckySevens,
    PERFECT_PAIRS_PAYTABLE: PERFECT_PAIRS_PAYTABLE,
    TWENTY_ONE_PLUS_3_PAYTABLE: TWENTY_ONE_PLUS_3_PAYTABLE,
    LUCKY_SEVENS_PAYTABLE: LUCKY_SEVENS_PAYTABLE,
    INSURANCE_PAYTABLE: INSURANCE_PAYTABLE,
    RANKS: RANKS,
    SUITS: SUITS,
    PHASE: PHASE,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.BlackjackCore = api;
  }

})();
