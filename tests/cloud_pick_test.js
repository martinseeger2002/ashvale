/* which save a game plays when the Bank answers (2026-10-24): a save this device never synced with the Bank never outranks
   the Bank's, whatever the clocks say (a new character made because the Bank answered late was kept as "newer" and then
   saved over a player's real hero); synced saves keep the lineage rule of 2026-10-07/08 */
'use strict';
const fs = require('fs'), path = require('path');
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8');
const savedWithBank = eval('(' + src.match(/const savedWithBank = (l => [^\n]*);/)[1] + ')');
const cloudWins = eval('(' + src.match(/const cloudWins = (\(local, at\) => [\s\S]*?: at !== \+local\.mine);/)[1].replace(/\/\*[\s\S]*?\*\//g, '') + ')');
const BANK = 1000;   /* the Bank's save id (ms) */
ok(cloudWins(null, BANK) === true, 'nothing here: the Bank\'s');
ok(cloudWins({ at: 5000 }, BANK) === true, 'a newer save this device never synced (a fresh character): still the Bank\'s');
ok(cloudWins({ at: 5000, base: BANK }, BANK) === false, 'this device continues the Bank\'s save: its own (it may hold play the Bank has not had)');
ok(cloudWins({ at: 5000, base: 900 }, BANK) === true, 'another device has played since this one synced: the Bank\'s');
ok(cloudWins({ at: 5000, base: 900, mine: BANK }, BANK) === false, 'the Bank holds this device\'s own last save (its svok lost): its own');
ok(cloudWins({ at: 5000, mine: BANK }, BANK) === false, 'a first device that saved to the Bank and has not loaded since: its own');
ok(cloudWins({ at: 5000, mine: 700 }, BANK) === true, 'a first device whose save the Bank no longer holds: the Bank\'s');
ok(savedWithBank({ at: 1 }) === false && savedWithBank({ base: 0 }) === true && savedWithBank(null) === false, 'synced means a base or a mine');
ok(/if \(!synced\) \{/.test(src) && /BANK_WAIT/.test(src) && /Asking the Bank for your hero/.test(src), 'a signed-in player with nothing synced waits for the Bank, the loading screen counting');
ok(/BANK_MISSED\) hud\.chat\(/.test(src), 'and is told when the Bank never answered (a fresh character, nothing kept)');
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
