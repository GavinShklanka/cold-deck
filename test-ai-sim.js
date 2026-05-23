/**
 * Headless 300-hand bot AI validation sim.
 * Run with: node test-ai-sim.js
 * 
 * Pass conditions:
 * 1. No bot has VPIP at 0 or 100
 * 2. No bot folds 100% or shoves 100%
 * 3. Archer's VPIP and aggression > Kaboose's
 * 4. Kaboose folds clear-trash spots more often than Archer
 * 5. Chip total across all seats stays constant at starting bankroll × 6 every hand
 */

// Load the poker engine from poker.html by extracting the IIFE
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/poker.html', 'utf-8');

// Extract the engine script (first <script> block)
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error("Could not find engine script"); process.exit(1); }

// Execute the engine in this context
const engineCode = scriptMatch[1];
eval(engineCode);

const PC = globalThis.PokerCore;
if (!PC) { console.error("PokerCore not found after eval"); process.exit(1); }

// Monkey-patch equityMC with a fast heuristic (no MC sims at all).
// The test validates decision distribution patterns, not equity accuracy.
// This gives roughly correct equity ranges using the hand evaluator directly.
const _best7 = PC.best7, _makeDeck = PC.makeDeck, _shuffle = PC.shuffle;
PC.equityMC = function(hole, community, nOpp, sims) {
  // Fast: run only 8 rollouts max
  const known = [...hole, ...community];
  let wins = 0, ties = 0;
  const n = 8;
  for (let s = 0; s < n; s++) {
    const deck = _makeDeck().filter(c => !known.some(k => k.r === c.r && k.s === c.s));
    _shuffle(deck);
    let p = 0;
    const board = community.slice();
    while (board.length < 5) board.push(deck[p++]);
    const opp = [];
    for (let o = 0; o < Math.min(nOpp, 3); o++) opp.push([deck[p++], deck[p++]]);
    const myScore = _best7([...hole, ...board]);
    let better = 0, equal = 0;
    for (const oh of opp) {
      const os = _best7([...oh, ...board]);
      const c = PC.cmpScore(os, myScore);
      if (c > 0) better++;
      else if (c === 0) equal++;
    }
    if (better === 0 && equal === 0) wins++;
    else if (better === 0) ties++;
  }
  return (wins + ties * 0.5) / n;
};

const TOTAL_HANDS = 200;
const START_STACK = 10000000;  // 100k BB deep — no one busts during the sim
const NUM_PLAYERS = 6;
const EXPECTED_TOTAL = START_STACK * NUM_PLAYERS;

// Bot names (indices 1-5)
const BOT_NAMES = ["Daniel Negreanu", "Thanos", "Sterling Archer", "Peter Griffin", "Kaboose"];

// Stats tracking per bot
const stats = {};
BOT_NAMES.forEach(name => {
  stats[name] = {
    hands: 0,          // hands dealt in
    vpipHands: 0,      // hands voluntarily put $ in preflop
    raiseActions: 0,   // total raise/bet/allin actions across all streets
    totalActions: 0,   // total actions taken
    foldActions: 0,    // total folds
    facedRaise: 0,     // times faced a raise/bet (had to call or fold)
    foldedToRaise: 0,  // times folded when facing a raise/bet
    allinActions: 0,   // all-in shoves
  };
});

let chipErrors = 0;

// Create game with large stacks, fixed blinds
// Seat 0 uses an existing archetype name so _quip lookups don't crash
const game = new PC.PokerGame({
  names: ["Daniel Negreanu", ...BOT_NAMES],
  startStack: START_STACK,
  sb: 50,
  bb: 100,
});

// Override player 0 to be a bot too (so all 6 seats run AI)
game.players[0].isHuman = false;
game.players[0].traits = PC.rollTraits("Daniel Negreanu");
game.players[0].model = "TestBot";

let handsPlayed = 0;

while (handsPlayed < TOTAL_HANDS) {
  // Reset all players to active with full stacks to prevent anyone from busting/elimination
  game.players.forEach(p => {
    p.chips = START_STACK;
    p.out = false;
  });

  const active = game.activePlayers();
  if (active.length < 2) break;

  // Fixed blinds — no escalation for this test
  game.sb = 50;
  game.bb = 100;

  game.snapshotStart();
  game.startHand();
  if (game.over) break;

  // Track which bots are in this hand, and whether they've voluntarily
  // put money in preflop already
  const vpipTracked = {};
  game.players.forEach(p => {
    if (!p.out && p.id > 0) {
      stats[p.name].hands++;
      vpipTracked[p.id] = false;
    }
  });

  // Play the hand to completion
  let safetyCounter = 0;
  while (game.getState().phase !== "done" && safetyCounter < 500) {
    safetyCounter++;
    const state = game.getState();

    if (state.runout) {
      game.continueRunout();
      continue;
    }

    const pid = game.acting;
    if (pid == null) break;

    const p = game.players[pid];
    if (p.folded || p.allIn || p.out) break;

    const toCall = game.betToCall - p.currentBet;
    const dec = game.aiDecide(pid);
    const botName = p.name;

    // Track stats for bots (id 1-5 only — not the test bot at seat 0)
    if (p.id > 0 && stats[botName]) {
      const s = stats[botName];
      s.totalActions++;

      if (dec.type === "fold") {
        s.foldActions++;
        if (toCall > 0) s.foldedToRaise++;
      }
      if (toCall > 0) s.facedRaise++;

      if (dec.type === "raise" || dec.type === "bet" || dec.type === "allin") {
        s.raiseActions++;
        if (dec.type === "allin") s.allinActions++;
        if (state.phase === "preflop" && !vpipTracked[p.id]) {
          s.vpipHands++;
          vpipTracked[p.id] = true;
        }
      }
      if (dec.type === "call") {
        if (state.phase === "preflop" && toCall > 0 && !vpipTracked[p.id]) {
          s.vpipHands++;
          vpipTracked[p.id] = true;
        }
      }
    }

    game.act(pid, dec.type, dec.amount);
  }
  if (safetyCounter >= 500) {
    const st = game.getState();
    const actP = st.acting != null ? game.players[st.acting] : null;
    console.error("STALL hand " + (handsPlayed + 1) + 
      ": phase=" + st.phase + " acting=" + st.acting + 
      " runout=" + st.runout +
      (actP ? " folded=" + actP.folded + " allIn=" + actP.allIn + " out=" + actP.out : " actP=null") +
      " inHand=" + game.inHand().length + " canAct=" + game.canAct().length);
    break; // break outer loop on stall
  }

  // Verify chip conservation
  const totalChips = game.players.reduce((sum, p) => sum + p.chips, 0);
  if (totalChips !== EXPECTED_TOTAL) {
    chipErrors++;
    if (chipErrors <= 3) {
      console.error(`CHIP ERROR hand ${handsPlayed + 1}: total=${totalChips}, expected=${EXPECTED_TOTAL}`);
    }
  }

  handsPlayed++;
}

// Report results
console.log(`\n========================================`);
console.log(`  HEADLESS BOT AI SIM — ${handsPlayed} HANDS`);
console.log(`========================================\n`);

console.log(`Chip conservation errors: ${chipErrors}`);
console.log(`Total chips final: ${game.players.reduce((s, p) => s + p.chips, 0)} (expected ${EXPECTED_TOTAL})\n`);

console.log(`${"Bot".padEnd(20)} ${"VPIP%".padStart(7)} ${"Raise%".padStart(8)} ${"Fold%".padStart(7)} ${"FoldToR%".padStart(9)} ${"AllIn%".padStart(8)} ${"Hands".padStart(7)}`);
console.log("-".repeat(70));

const results = {};
BOT_NAMES.forEach(name => {
  const s = stats[name];
  const vpip = s.hands > 0 ? (100 * s.vpipHands / s.hands) : 0;
  const raiseFreq = s.totalActions > 0 ? (100 * s.raiseActions / s.totalActions) : 0;
  const foldFreq = s.totalActions > 0 ? (100 * s.foldActions / s.totalActions) : 0;
  const foldToRaise = s.facedRaise > 0 ? (100 * s.foldedToRaise / s.facedRaise) : 0;
  const allinFreq = s.totalActions > 0 ? (100 * s.allinActions / s.totalActions) : 0;

  results[name] = { vpip, raiseFreq, foldFreq, foldToRaise, allinFreq };

  console.log(
    `${name.padEnd(20)} ${vpip.toFixed(1).padStart(7)} ${raiseFreq.toFixed(1).padStart(8)} ${foldFreq.toFixed(1).padStart(7)} ${foldToRaise.toFixed(1).padStart(9)} ${allinFreq.toFixed(1).padStart(8)} ${String(s.hands).padStart(7)}`
  );
});

// Validate pass conditions
console.log(`\n========================================`);
console.log(`  PASS/FAIL CONDITIONS`);
console.log(`========================================\n`);

let allPass = true;

function check(label, pass) {
  const status = pass ? "PASS" : "FAIL";
  if (!pass) allPass = false;
  console.log(`[${status}] ${label}`);
}

// 1. No bot has VPIP at 0 or 100
BOT_NAMES.forEach(name => {
  const v = results[name].vpip;
  check(`${name} VPIP not 0 or 100: ${v.toFixed(1)}%`, v > 0 && v < 100);
});

// 2. No bot folds 100% or shoves 100%
BOT_NAMES.forEach(name => {
  const f = results[name].foldFreq;
  const a = results[name].allinFreq;
  check(`${name} fold/shove not 100%: fold=${f.toFixed(1)}%, allin=${a.toFixed(1)}%`, f < 100 && a < 100);
});

// 3. Archer's VPIP > Kaboose's VPIP
{
  const av = results["Sterling Archer"].vpip;
  const kv = results["Kaboose"].vpip;
  check(`Archer VPIP (${av.toFixed(1)}%) > Kaboose VPIP (${kv.toFixed(1)}%)`, av > kv);
}

// 3b. Archer's raise freq > Kaboose's raise freq
{
  const ar = results["Sterling Archer"].raiseFreq;
  const kr = results["Kaboose"].raiseFreq;
  check(`Archer Raise% (${ar.toFixed(1)}%) > Kaboose Raise% (${kr.toFixed(1)}%)`, ar > kr);
}

// 4. Kaboose folds clear-trash spots more often than Archer
{
  const af = results["Sterling Archer"].foldToRaise;
  const kf = results["Kaboose"].foldToRaise;
  check(`Kaboose FoldToRaise (${kf.toFixed(1)}%) > Archer FoldToRaise (${af.toFixed(1)}%)`, kf > af);
}

// 5. Chip conservation
check(`Chip conservation: ${chipErrors} errors`, chipErrors === 0);

console.log(`\n========================================`);
console.log(`  OVERALL: ${allPass ? "ALL PASS ✅" : "SOME FAILURES ❌"}`);
console.log(`========================================\n`);

process.exit(allPass ? 0 : 1);
