/* ASHVALE 3D judge (the LIGHTER judge, 2026-10-04): the arcade's referee calls judge(seed, inputs, params) in
   QuickJS (5 s CPU, 64 MB, source <= 256 KB) and signs a prize only for {won: true}. The rules live in src/audit.js,
   which the page runs too; this file only binds them to the bundle's AshCore and ASH_DATA. */
var ASH_AUDIT = AshAudit.create(AshCore, ASH_DATA);
function judge(seed, inputs, params) { return ASH_AUDIT.judge(seed, inputs, params); }
