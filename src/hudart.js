/* ASHVALE 3D HUD art: the interface's static look, split out of hud.js (2026-10-02: "modularize the HUD") so a
   CSS or icon tweak is one small inscription. CSS, the hit splats, tab and skill icons, the skill tables and three tiny
   text helpers. No DOM work here: hud.js injects the CSS. */
(function (G) {
  'use strict';
  const CSS = `
.ash *{box-sizing:border-box}.ash{position:absolute;inset:0;overflow:hidden;font:600 13px/1.25 "Trebuchet MS",Verdana,system-ui,sans-serif;color:#ffcf3f;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;--slot:40px;--mm:150px;--tab:40px}
@media (max-height:520px),(max-width:700px){.ash{--slot:29px;--mm:104px;--tab:36px;font-size:12px}}
@media (pointer:coarse) and (max-width:700px){.ash{--slot:44px;--mm:100px;--tab:48px;font-size:13px}}
@media (pointer:coarse) and (max-height:520px){.ash{--slot:38px;--mm:88px;--tab:44px}}
.ash canvas.gl{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}
.ash .lay{position:absolute;inset:0;pointer-events:none}
.ash .ui{pointer-events:auto}
.ash .stone{background:linear-gradient(#4a4034,#3a3127);border:2px solid #1b1610;box-shadow:inset 0 0 0 1px #6b5d48,0 2px 6px #0008;border-radius:6px}
.ash .t{text-shadow:1px 1px 0 #000}
.ash .mm{position:absolute;right:calc(var(--tab) + 14px);top:8px;width:var(--mm);height:var(--mm);border-radius:50%;border:3px solid #1b1610;box-shadow:0 0 0 2px #6b5d48,0 3px 8px #000a;background:#111;overflow:hidden}
.ash .mm canvas{width:100%;height:100%;display:block}
.ash .compass{position:absolute;right:calc(var(--tab) + 16px + var(--mm));top:10px;width:48px;height:48px;border-radius:50%;border:2px solid #1b1610;box-shadow:0 0 0 1px #6b5d48,0 2px 6px #000a;background:radial-gradient(circle at 50% 40%,#5c5040,#241e18 72%);z-index:3;cursor:pointer}
.ash .compass .face{position:absolute;inset:0}
.ash .compass b{position:absolute;font:700 11px/1 "Trebuchet MS",Verdana,sans-serif;color:#e8d7b0;text-shadow:1px 1px 0 #000}
.ash .compass b:nth-child(1){left:50%;top:4px;margin-left:-4px;color:#ff4a3a}
.ash .compass b:nth-child(2){right:4px;top:50%;margin-top:-5px}
.ash .compass b:nth-child(3){left:50%;bottom:4px;margin-left:-3px}
.ash .compass b:nth-child(4){left:4px;top:50%;margin-top:-5px}
.ash .compass i{position:absolute;left:50%;top:15px;width:0;height:0;margin-left:-4px;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:12px solid #e23;filter:drop-shadow(0 0 1px #000)}
.ash .compass i::after{content:'';position:absolute;left:-3px;top:9px;border-left:3px solid transparent;border-right:3px solid transparent;border-top:7px solid #f3ecdf}
.ash .orbs{position:absolute;right:calc(var(--tab) + 14px);top:8px;width:var(--mm);height:var(--mm);pointer-events:none;z-index:2}   /* the same box as the minimap, so the orbs can sit on its rim */
.ash .orb{position:absolute;left:50%;top:50%;width:calc(var(--mm)*.34);height:calc(var(--mm)*.34);margin-left:calc(var(--mm)*-.17);margin-top:calc(var(--mm)*-.17);border-radius:50%;border:2px solid #1b1610;box-shadow:0 0 0 1px #6b5d48;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;cursor:pointer;overflow:hidden;background:#222;pointer-events:auto;transform:rotate(var(--a)) translateX(calc(var(--mm)/2 + 4px)) rotate(calc(var(--a)*-1))}   /* on the rim: under the compass, then along the lower border */
.ash .orb.hp{--a:150deg}.ash .orb.run{--a:108deg}.ash .orb.pray{--a:66deg}
.ash .orb i{position:absolute;left:0;right:0;bottom:0;display:block}
.ash .orb b{position:relative;text-shadow:1px 1px 0 #000}
.ash .orb.hp.poison{box-shadow:0 0 0 2px #3fbf3a,0 0 10px #3fbf3a}.ash .orb.hp.poison i{background:linear-gradient(#5fd84a,#2e8a26)!important}.ash .orb.hp.poison b{color:#e8ffd8}
.ash .orb.hp.poison::after{content:'';position:absolute;right:-5px;top:-5px;width:13px;height:13px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#3fbf3a;border:2px solid #10300c;box-shadow:0 0 6px #3fbf3a;animation:ashDrip 1.2s ease-in-out infinite}
@keyframes ashDrip{0%,100%{transform:rotate(-45deg) scale(1)}50%{transform:rotate(-45deg) scale(1.2)}}
.ash .splat.poison{background:radial-gradient(circle,#4fcf3a 55%,#1d5a14 60%);border-radius:50%;color:#fff}
.ash .orb.hp i{background:linear-gradient(#e33,#911)} .ash .orb.hp.hawk i{background:linear-gradient(#d8a04a,#7a4a1a)} .ash .orb.run i{background:linear-gradient(#e8d84a,#9a8a1a)} .ash .orb.run.off i{background:linear-gradient(#8a8a7a,#555)} .ash .orb.pray i{background:linear-gradient(#7fd8ff,#1f6aa8)} .ash .orb.pray.on{box-shadow:0 0 0 1px #6b5d48,0 0 8px 2px #8fe0ffcc}
.ash .orb.pray b{display:flex;flex-direction:column;align-items:center;line-height:1}.ash .orb.pray b svg{width:14px;height:14px;margin-bottom:1px}
.ash .prayers{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
.ash .pry{position:relative;aspect-ratio:1;border-radius:5px;background:#2c251c;box-shadow:inset 0 0 0 1px #4b4032;display:flex;align-items:center;justify-content:center;cursor:pointer}
.ash .pry svg{width:70%;height:70%}.ash .pry.soon svg,.ash .pry.low svg{opacity:.28;filter:grayscale(1)}
.ash .pry.on{background:radial-gradient(#fff6c8,#e8c45a 55%,#8a6a20);box-shadow:inset 0 0 0 1px #fff3b0,0 0 6px #ffe48a}
.ash .pry .lv{position:absolute;right:2px;bottom:0;font-size:9px;color:#c8b48a;text-shadow:1px 1px 0 #000}
.ash .pry.soon .lv{color:#8a7a60}.ash .pry.sel{outline:1px solid #fff}
.ash .ppbar{height:8px;border-radius:4px;background:#1b1610;box-shadow:inset 0 0 0 1px #4b4032;overflow:hidden;margin:2px 0 6px}.ash .ppbar i{display:block;height:100%;background:linear-gradient(90deg,#1f6aa8,#7fd8ff)}
.ash .soonbox{margin:10px 0;padding:16px 8px;border-radius:6px;background:#2c251c;box-shadow:inset 0 0 0 1px #4b4032;text-align:center;color:#ffcf3f;font-size:15px}.ash .soonbox small{display:block;margin-top:6px;color:#c8b48a;font-size:11px}
.ash .ohd{position:absolute;width:30px;height:30px;transform:translate(-50%,-100%);pointer-events:none;background-size:contain;background-repeat:no-repeat;filter:drop-shadow(0 1px 1px #000)}
.ash .tabs{position:absolute;right:6px;top:8px;display:flex;flex-direction:column;gap:4px}
.ash .tab{width:var(--tab);height:var(--tab);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.ash .tab svg{width:62%;height:62%}
.ash .tab.on{background:linear-gradient(#7a3a22,#5a2a18);box-shadow:inset 0 0 0 1px #d08050}
.ash .panel{position:absolute;right:calc(var(--tab) + 14px);top:calc(var(--mm) + 46px);max-height:calc(100% - var(--mm) - 54px);width:calc(var(--slot)*4 + 34px);padding:8px;overflow:auto;display:none}
.ash .panel.open{display:block}
.ash .inv{display:grid;grid-template-columns:repeat(4,var(--slot));grid-auto-rows:var(--slot);gap:3px;justify-content:center}
.ash .slot{position:relative;border-radius:4px;background:#2c251c;box-shadow:inset 0 0 0 1px #4b4032;cursor:pointer}
.ash .slot img{position:absolute;inset:1px;width:calc(100% - 2px);height:calc(100% - 2px);image-rendering:auto;pointer-events:none}
.ash .slot .n{position:absolute;left:2px;top:0;font-size:10px;color:#ff0;text-shadow:1px 1px 0 #000;pointer-events:none}
.ash .slot .n.k{color:#fff}.ash .slot .n.m{color:#0f8}
.ash .slot.sel{box-shadow:inset 0 0 0 2px #fff}
.ash .slot.aim{box-shadow:inset 0 0 0 2px #f07818}
.ash .friends{display:flex;flex-direction:column;gap:2px;margin-top:4px}
.ash .frnd{display:block;width:100%;text-align:left;padding:5px 8px;background:#2a241c;border:1px solid #1b1610;box-shadow:inset 0 0 0 1px #5a4c38;color:#ff3333;font:700 14px/1.2 "Trebuchet MS",Verdana,sans-serif;cursor:pointer}
.ash .frnd.on{color:#00e000}
.ash .frnd:hover{background:#3a3228}
.ash .slot.ghost{opacity:.45}
.ash .slot .fb{position:absolute;inset:4px;border-radius:3px;font-size:9px;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center}
.ash .equip{display:grid;grid-template-columns:repeat(3,var(--slot));grid-auto-rows:var(--slot);gap:6px;justify-content:center;margin:2px 0 8px}
.ash .equip .slot.empty::after{content:attr(data-l);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#7d6c55}
.ash .equip .slot.off{opacity:.35}
.ash .bon{display:grid;grid-template-columns:1fr auto;gap:1px 8px;font-size:11px;color:#ff981f}
.ash .bon b{color:#ffcf3f;text-align:right}
.ash h4{margin:0 0 6px;font-size:13px;color:#ff981f;text-align:center}
.ash .skills{display:grid;grid-template-columns:1fr 1fr;gap:3px}
.ash .sk{display:flex;align-items:center;gap:4px;padding:3px 4px;border-radius:4px;background:#2c251c;box-shadow:inset 0 0 0 1px #4b4032;cursor:pointer;font-size:12px}
.ash .sk svg{width:16px;height:16px;flex:none}
.ash .sk span{margin-left:auto;color:#ff0}
.ash .info{margin-top:6px;font-size:11px;color:#fff;min-height:28px}
.ash .btn{display:block;width:100%;margin:4px 0;padding:6px 4px;background:linear-gradient(#5a4c3a,#433829);border:1px solid #1b1610;box-shadow:inset 0 0 0 1px #7b6b52;border-radius:4px;color:#ffcf3f;font:inherit;cursor:pointer;text-align:center}
.ash .shop [data-buy],.ash .shop [data-sell]{display:inline-block;width:auto;min-width:84px;min-height:44px;margin:6px 6px 0 0;padding:10px 14px;font-size:15px}   /* big enough to hit on a phone (the operator: "the armory buy button is too small") */
.ash .btn.on{background:linear-gradient(#7a3a22,#5a2a18);box-shadow:inset 0 0 0 1px #d08050;color:#fff}
.ash .btn small{display:block;color:#c8b48a;font-size:10px;font-weight:400}
.ash .chatw{position:absolute;left:8px;bottom:8px;width:min(46vw,440px)}
.ash .say{display:none;gap:4px;margin-top:4px}.ash .say.on{display:flex}
.ash .say.kb{position:fixed;left:8px;right:8px;z-index:36;margin:0;padding:6px;border-radius:8px;background:#1b1610f0;box-shadow:0 0 0 1px #6b5d48,0 6px 18px #000a}
.ash .say input{flex:1;min-width:0;font-size:16px;padding:3px 8px;border-radius:5px;border:1px solid #6b5d48;background:#000a;color:#fff}
.ash .say button{font:inherit;padding:0 10px;border-radius:5px;border:1px solid #1b1610;background:linear-gradient(#5a4c3a,#433829);color:#ffcf3f;cursor:pointer}
.ash .chat .player{color:#7cf}
.ash .bub{position:absolute;transform:translate(-50%,-100%);max-width:200px;padding:2px 7px;border-radius:7px;background:#0008;color:#ff0;font-size:12px;text-align:center;text-shadow:1px 1px 0 #000;pointer-events:none}
.ash .chat{max-height:calc(5*1.3em + 12px);padding:5px 8px;background:#0007;border-radius:6px;font-size:12px;color:#fff;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;cursor:pointer}
.ash .chat.big{max-height:min(60%,260px);background:#000b;overflow:auto;justify-content:flex-start}
@media (max-height:520px){.ash .inv{gap:2px}.ash .panel{padding:5px 6px}.ash .panel h4{margin-bottom:3px}.ash .chat{max-height:calc(3*1.3em + 10px);font-size:11px}.ash .chatw{width:min(40vw,360px)}}
.ash .chat div{margin:1px 0;text-shadow:1px 1px 0 #000}
.ash .chat .warn{color:#ff6a5a}.ash .chat .level{color:#7fd0ff}.ash .chat .trade{color:#ffd77a}.ash .chat .quest{color:#d9a0ff}.ash .chat .npc{color:#9cf}.ash .chat .sys{color:#ffcf3f}.ash .chat .dm{color:#ff9ce0}
.ash .hover{position:absolute;left:8px;top:6px;font-size:13px;color:#fff;text-shadow:1px 1px 0 #000;pointer-events:none;white-space:nowrap}
.ash .xy{position:absolute;right:8px;bottom:6px;font-size:11px;color:#c8b48a;text-shadow:1px 1px 0 #000;pointer-events:none}
.ash .opp{position:absolute;left:8px;top:28px;padding:4px 8px;min-width:130px;display:none}
.ash .opp .bar{height:10px;background:#a00;margin-top:3px;border:1px solid #000}.ash .opp .bar i{display:block;height:100%;background:#0c0}
.ash .hpb{position:absolute;width:34px;height:5px;background:#c00;border:1px solid #000;transform:translate(-50%,-50%)}
.ash .hpb i{display:block;height:100%;background:#0d0}
.ash .splat{position:absolute;width:26px;height:24px;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;color:#fff;font:800 13px/1 Verdana,sans-serif;text-shadow:1px 1px 0 #000;background:no-repeat center/contain}
.ash .splat.miss{color:#fff}
.ash .tag{position:absolute;transform:translate(-50%,-100%);color:#0ff;font-size:11px;text-shadow:1px 1px 0 #000;white-space:nowrap;text-align:center;line-height:1.25} .ash .tag .tl{color:#ffcf3f;font-size:10px}
.ash .xpd{position:absolute;right:calc(var(--tab) + 30px + var(--mm) + var(--mm)*.36);top:20px;text-align:right;font-size:12px;color:#fff;text-shadow:1px 1px 0 #000;pointer-events:none}
.ash .xpd div{animation:ashxp 1.6s ease-out forwards}
@keyframes ashxp{0%{opacity:0;transform:translateY(16px)}15%{opacity:1;transform:translateY(0)}80%{opacity:1}100%{opacity:0;transform:translateY(-24px)}}
.ash .banner{position:absolute;left:50%;top:18%;transform:translateX(-50%);padding:10px 22px;text-align:center;font-size:18px;color:#fff;display:none;white-space:nowrap}
.ash .banner small{display:block;font-size:12px;color:#ffcf3f}
.ash .dead{position:absolute;inset:0;background:radial-gradient(#0000,#300c);display:none;align-items:center;justify-content:center;font:700 30px Georgia,serif;color:#e8d0a0;text-shadow:2px 2px 0 #000}
.ash .dlg{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);width:min(560px,70vw);padding:10px 16px;display:none;cursor:pointer;text-align:center;color:#000}
.ash .dlg.stone{background:linear-gradient(#d8c8a0,#c4b386);box-shadow:inset 0 0 0 2px #8a7650,0 3px 8px #000a}
.ash .dlg .nm{color:#801;font-size:14px;margin-bottom:4px}
.ash .dlg .ln{font-size:14px;font-weight:600;line-height:1.35}
.ash .dlg .go{color:#00c;font-size:12px;margin-top:6px}
.ash .dlg .go .btn{margin:4px 4px 0;cursor:pointer}
.ash .ctx{position:absolute;display:none;min-width:150px;padding:2px;background:#5d5447;border:1px solid #000;box-shadow:0 2px 8px #000b;border-radius:3px;z-index:9}
.ash .ctx .h{background:#000;color:#5d5447;padding:2px 6px;font-size:12px}
.ash .ctx div.opt{padding:5px 8px;color:#fff;cursor:pointer;white-space:nowrap;font-size:13px}
.ash .ctx div.opt:hover,.ash .ctx div.opt:active{background:#7a6c58}
.ash .y{color:#ff0}.ash .o{color:#ff9040}.ash .c{color:#0ff}.ash .g{color:#0f0}.ash .r{color:#f44}.ash .w{color:#fff}
.ash .shop{position:absolute;left:50%;top:calc(8px + env(safe-area-inset-top, 0px));transform:translateX(-50%);width:min(620px,calc(100vw - 16px));max-height:calc(100% - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));padding:8px 10px;display:none;flex-direction:column;z-index:5}
.ash .shop.chest{left:8px;transform:none;width:min(460px,calc(100vw - 250px))}   /* the bag is the inventory panel, so the chest sits to its left */
.ash .shop.chest.phone{left:50%;transform:translateX(-50%);width:min(620px,calc(100vw - 16px))}   /* a phone keeps the old centred chest, bag and all: the side panel does not fit beside it */
.ash .shop .hd{display:flex;align-items:center;justify-content:space-between;color:#ff981f;font-size:15px;margin-bottom:4px}
.ash .shop .x{width:28px;height:28px;border-radius:4px;background:#7a2a18;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid #000}
.ash .shop .cols{display:flex;gap:10px;min-height:0;flex:1;overflow:auto}
.ash .shop .col{flex:1;min-width:0}
.ash .shop .col h5{margin:2px 0 4px;color:#ffcf3f;font-size:12px}
.ash .shop .grid{display:grid;grid-template-columns:repeat(auto-fill,var(--slot));grid-auto-rows:calc(var(--slot) + 12px);gap:3px}
.ash .shop .grid .slot .p{position:absolute;left:0;right:0;bottom:-1px;font-size:9px;color:#ff0;text-align:center;text-shadow:1px 1px 0 #000}
.ash .shop .grid .slot img{height:calc(var(--slot) - 2px)}
.ash .shop .sel{margin-top:6px;min-height:44px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#fff;font-size:12px}
.ash .shop .sel .btn{width:auto;display:inline-block;margin:0;padding:6px 10px}
.ash .shop .gold{color:#ff0}
.ash .help{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 24px));max-height:calc(100% - 24px);overflow:auto;padding:14px 18px;color:#f3e6c4;display:none;z-index:8;font-weight:400}
.ash .help h3{margin:0 0 8px;color:#ff981f;font:700 20px Georgia,serif}
.ash .help ul{margin:4px 0 10px 18px;padding:0} .ash .help li{margin:3px 0}
.ash .help .btn{margin-top:8px}
.ash .mark{position:absolute;width:18px;height:18px;transform:translate(-50%,-50%);pointer-events:none;font:900 18px/18px sans-serif;text-align:center;text-shadow:0 0 2px #000;animation:ashmark .45s ease-out forwards}
@keyframes ashmark{0%{transform:translate(-50%,-50%) scale(1.4)}100%{transform:translate(-50%,-50%) scale(.6);opacity:0}}
.ash .cc{position:absolute;left:8px;top:8px;max-height:calc(100% - 16px);width:min(340px,46vw);padding:10px 12px;overflow:auto;display:none;z-index:7;color:#f3e6c4}
.ash .cc h3{margin:0 0 6px;color:#ff981f;font:700 18px Georgia,serif}
.ash .cc .row{display:flex;align-items:center;gap:6px;margin:5px 0;flex-wrap:wrap}
.ash .cc .lab{width:52px;color:#ffcf3f;font-size:12px}
.ash .cc .arr{width:30px;height:30px;border-radius:4px;background:#2c251c;border:1px solid #6b5d48;color:#ffcf3f;font:700 15px sans-serif;cursor:pointer;padding:0}
.ash .cc .val{min-width:74px;text-align:center;color:#fff;font-size:12px}
.ash .cc .sw{width:22px;height:22px;border-radius:50%;border:2px solid #1b1610;cursor:pointer;padding:0}
.ash .cc .sw.on{border-color:#fff;box-shadow:0 0 0 1px #000}
.ash .cc .sw.none{background:repeating-linear-gradient(45deg,#2c251c 0 4px,#6b5d48 4px 6px)}
.ash .cc input{font-size:16px;padding:5px 8px;border-radius:4px;border:1px solid #6b5d48;background:#1e1a14;color:#fff;width:150px}
.ash .cc .btns{display:flex;gap:8px;margin-top:8px}.ash .cc .btns .btn{margin:0}
.ash .wtag{color:#ff5a4a;font-size:10px;text-align:center;letter-spacing:.5px;margin:-2px 0 3px}
.ash .wbar{position:relative;height:14px;margin:0 2px 4px;background:#2c251c;border:1px solid #1b1610;border-radius:3px;overflow:hidden}
.ash .wbar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#7a9a4a,#4a6a2a)}
.ash .wbar.heavy i{background:linear-gradient(#d04030,#801a10)}
.ash .wbar span{position:relative;display:block;text-align:center;font-size:10px;line-height:12px;color:#fff;text-shadow:1px 1px 0 #000}
.ash .cc .pts{color:#ff0;font-size:13px;margin:4px 0}
.ash .cc .skl{display:flex;align-items:center;gap:6px;margin:3px 0}
.ash .cc .skl svg{width:18px;height:18px;flex:none}
.ash .cc .skl .nm{width:84px;color:#ffcf3f;font-size:12px}.ash .cc .skl .v{width:22px;text-align:center;color:#fff}
.ash .cc .skl small{color:#c8b48a;font-size:10px;flex:1;min-width:0}
.ash .slot{touch-action:none}
.ash .dragicon{position:absolute;width:var(--slot);height:var(--slot);transform:translate(-50%,-60%) scale(1.15);pointer-events:none;opacity:.88;z-index:30;filter:drop-shadow(0 3px 4px #000a)}
.ash .dragicon img{width:100%;height:100%}.ash .dragicon .n{position:absolute;left:2px;top:0;font-size:10px;color:#ff0;text-shadow:1px 1px 0 #000}
.ash .slot.dragsrc{opacity:.35}
.ash .splat.fx{width:30px;height:30px;font-size:10px;color:#003;text-shadow:none}
.ash .netlost{position:absolute;left:50%;top:max(8px,env(safe-area-inset-top));transform:translateX(-50%);width:min(560px,calc(100vw - 24px));z-index:18;display:none;align-items:center;gap:12px;padding:10px 12px 10px 14px;border-radius:10px;background:#5a1414f0;box-shadow:0 0 0 2px #e05a4a,0 6px 20px #000a;color:#fde9e4;font:14px/1.35 system-ui,sans-serif}
.ash .netlost b{color:#fff}
.ash .netlost>div{flex:1 1 auto;min-width:0}.ash .netlost .btn{flex:none;width:auto;margin:0;padding:8px 14px}
.ash .newver{position:absolute;left:50%;top:max(8px,env(safe-area-inset-top));transform:translateX(-50%);width:min(560px,calc(100vw - 24px));z-index:17;display:none;padding:10px 14px;border-radius:10px;background:#3b2c08f2;box-shadow:0 0 0 2px #e8b33a,0 6px 20px #000a;color:#fbefcf;font:14px/1.35 system-ui,sans-serif}
.ash .newver b{color:#ffd76a}
.ash .elsewhere{position:absolute;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:#0b0907e8;padding:16px}
.ash .elsewhere>div{max-width:420px;padding:20px 22px;border-radius:12px;background:#231d14;box-shadow:0 0 0 2px #8a6a2c;color:#f3e7cc;font:15px/1.45 system-ui,sans-serif;text-align:center}
.ash .elsewhere b{display:block;font-size:18px;margin-bottom:8px;color:#ffd76a}
.ash .elsewhere .btn{margin:14px auto 0;padding:9px 18px}
.ash .numpad{position:absolute;inset:0;z-index:35;display:none;align-items:center;justify-content:center;background:#0006}
.ash .numpad .np{width:min(280px,calc(100vw - 32px));padding:12px;display:flex;flex-direction:column;gap:10px}
.ash .numpad .t{color:#ffcf3f;font-weight:700;text-align:center;font-size:15px}
.ash .numpad .scr{display:flex;align-items:baseline;justify-content:flex-end;gap:8px;padding:8px 12px;border-radius:6px;background:#0d1a0d;box-shadow:inset 0 0 0 2px #2d4a2a,inset 0 2px 8px #000;color:#9cff8a;font:700 28px/1.1 ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.ash .numpad .scr small{font-size:12px;color:#6fae64;font-weight:400}
.ash .numpad .keys{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ash .numpad .keys .btn,.ash .numpad .row .btn{margin:0;padding:12px 0;font-size:18px;touch-action:manipulation}
.ash .numpad .row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ash .numpad .row .ok:disabled{opacity:.45}
.ash .travel{position:absolute;inset:0;z-index:19;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#05070d;overflow:hidden;pointer-events:auto;touch-action:none}
.ash .travel .sw{position:absolute;left:50%;top:50%;width:170vmax;height:170vmax;margin:-85vmax 0 0 -85vmax;border-radius:50%;background:repeating-conic-gradient(from 0deg,#1b4f9a00 0deg,#3d8ff0aa 14deg,#9fd0ff55 22deg,#1b4f9a00 40deg),radial-gradient(circle,#bfe4ff 0,#5fa8ff 7%,#1d4c9c 22%,#0b1a3a 46%,#05070d 70%);animation:ashsw 2.4s linear infinite}
.ash .travel .sw2{position:absolute;left:50%;top:50%;width:46vmin;height:46vmin;margin:-23vmin 0 0 -23vmin;border-radius:50%;border:2.2vmin solid #8fd0ff;box-shadow:0 0 6vmin #4aa3ff,inset 0 0 6vmin #4aa3ff;animation:ashsw2 1.6s ease-in-out infinite alternate}
.ash .travel.down{background:radial-gradient(ellipse at 50% 62%,#3a2412 0,#140c07 38%,#020101 72%)}
.ash .travel.down .sw,.ash .travel.down .sw2,.ash .travel.up .sw,.ash .travel.up .sw2,.ash .travel.lodge .sw,.ash .travel.lodge .sw2,.ash .travel.lodgeout .sw,.ash .travel.lodgeout .sw2{display:none}
.ash .travel.lodge{background:radial-gradient(circle at 50% 4%,#fff3d0 0,#d8c8a0 3%,transparent 7%),radial-gradient(ellipse at 50% 30%,transparent 0,#0000 30%,#1a0f07ee 78%),repeating-linear-gradient(0deg,#d9cfb4 0 3px,#e8dfc6 3px 9px,#3b2a1c 9px 10px,#e3d8bd 10px 22px),#d9cfb4}
.ash .travel.lodge::before{content:'';position:absolute;inset:0;background:repeating-conic-gradient(from -90deg at 50% 4%,#3a2614 0 1.6deg,transparent 1.6deg 22.5deg),repeating-linear-gradient(90deg,transparent 0 62px,#5a402888 62px 64px);opacity:.85}
.ash .travel.lodge::after{content:'';position:absolute;left:50%;bottom:-18vmin;width:90vmin;height:70vmin;margin-left:-45vmin;border-radius:50%;background:radial-gradient(ellipse at 50% 70%,#ffe08a 0,#ff8a20cc 14%,#c0400055 36%,transparent 66%);animation:ashFlicker .8s ease-in-out infinite alternate}
.ash .travel.lodge .tt,.ash .travel.lodgeout .tt{z-index:1;color:#fff1d6;text-shadow:0 0 14px #ff8a20,2px 2px 0 #1a0f07}.ash .travel.lodge .pb,.ash .travel.lodgeout .pb{z-index:1;background:#2a1a0ecc;box-shadow:0 0 0 1px #c08a4a88}.ash .travel.lodge .pb i,.ash .travel.lodgeout .pb i{background:linear-gradient(90deg,#8a3a10,#ffc060)!important}
.ash .travel.lodgeout{background:radial-gradient(ellipse 22% 40% at 50% 58%,#fff8e0 0,#f6e2a8 40%,#c8a060 70%,transparent 72%),repeating-linear-gradient(0deg,#3a2a1a 0 3px,#4a3624 3px 9px,#1a1008 9px 10px,#433020 10px 22px),#3a2a1a;animation:ashDawn 1.4s ease-out forwards}
.ash .travel.down::before{content:'';position:absolute;inset:-20% 0 0 0;background-image:radial-gradient(#a08868 1px,transparent 1.6px),radial-gradient(#6a5844 1px,transparent 1.5px);background-size:37px 53px,23px 41px;background-position:0 0,11px 17px;opacity:.55;animation:ashGrit 1.6s linear infinite}
.ash .travel.down::after{content:'';position:absolute;left:50%;top:58%;width:70vmin;height:70vmin;margin:-35vmin 0 0 -35vmin;border-radius:50%;background:radial-gradient(circle,#ff9a3c55 0,#ff7a2018 35%,transparent 65%);animation:ashFlicker .9s ease-in-out infinite alternate}
@keyframes ashGrit{from{transform:translateY(0)}to{transform:translateY(53px)}}
@keyframes ashFlicker{0%{opacity:.7;transform:scale(1)}40%{opacity:1}60%{opacity:.8;transform:scale(1.04)}100%{opacity:.95;transform:scale(.98)}}
.ash .travel.down .tt{color:#f3dcb8;text-shadow:0 0 14px #c06a20,2px 2px 0 #000}.ash .travel.down .pb{background:#1e1208cc;box-shadow:0 0 0 1px #a0602888}.ash .travel.down .pb i{background:linear-gradient(90deg,#a05a1c,#ffb050)!important}
.ash .travel.up{background:linear-gradient(180deg,#fff4d8 0,#c8b48a 18%,#2a1c10 62%,#050302 100%);animation:ashDawn 1.6s ease-out forwards}
@keyframes ashDawn{from{filter:brightness(.25)}to{filter:brightness(1)}}
.ash .travel.up .tt{color:#2a1c10;text-shadow:0 0 10px #fff4d8}.ash .travel.up .pb{background:#00000033}.ash .travel.up .pb i{background:#7a5a2a!important}
.ash .travel .tt{position:relative;font:700 24px Georgia,serif;color:#eef6ff;text-shadow:0 0 12px #2b6fd0,2px 2px 0 #000;text-align:center;padding:0 16px}
.ash .travel .pb{position:relative;width:min(260px,70vw);height:8px;border-radius:4px;background:#0b1a3acc;box-shadow:0 0 0 1px #4aa3ff88;overflow:hidden}
.ash .travel .pb i{display:block;height:100%;width:0;background:linear-gradient(90deg,#4aa3ff,#cfeaff);transition:width .3s}
@keyframes ashsw{to{transform:rotate(360deg)}}
@keyframes ashsw2{from{transform:scale(.9);opacity:.75}to{transform:scale(1.12);opacity:1}}
.ash .err{position:absolute;inset:0;background:#000c;color:#fff;display:none;align-items:center;justify-content:center;text-align:center;padding:20px;z-index:20;font-size:15px}
`;
  const SPLAT_RED = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 24"><path d="M13 1l3 4 5-2-1 5 5 2-4 3 4 4-5 1 1 5-5-2-3 4-3-4-5 2 1-5-5-1 4-4-4-3 5-2-1-5 5 2z" fill="#c4161c" stroke="#5a0000" stroke-width="1.2"/></svg>');
  const SPLAT_BLUE = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 24"><path d="M13 1l3 4 5-2-1 5 5 2-4 3 4 4-5 1 1 5-5-2-3 4-3-4-5 2 1-5-5-1 4-4-4-3 5-2-1-5 5 2z" fill="#2a5adc" stroke="#001a5a" stroke-width="1.2"/></svg>');
  const SV = (p, c) => '<svg viewBox="0 0 24 24"><path d="' + p + '" fill="' + (c || '#e8d6a0') + '" stroke="#1b1610" stroke-width="1"/></svg>';
  const ICON = {
    combat: SV('M4 3l9 9-2 2 2 2 2-2 2 2-2 2 3 3 2-2-3-3 2-2-2-2-2 2-2-2 9-9-3 0-8 8-8-8z', '#d9c9a0'),
    skills: SV('M3 20h3V12H3zm5 0h3V6H8zm5 0h3V9h-3zm5 0h3V3h-3z', '#7fd06a'),
    quest: SV('M5 3h11l3 3v15H5z M8 8h8M8 12h8M8 16h5', '#e8dcb0'),
    friends: SV('M8 11a3 3 0 100-6 3 3 0 000 6zM2 19c0-3 2.5-5 6-5s6 2 6 5M16 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM14 14c2.8 0 6 1.6 6 4.5', '#7dcea0'),
    wallet: SV('M3 7h16v12H3z M3 7l3-3h11v3 M15 12h4v3h-4z', '#e8b54a'),
    inv: SV('M7 7c0-3 2-4 5-4s5 1 5 4h2l1 14H4L5 7zm2 0h6c0-2-1-2-3-2S9 5 9 7z', '#b8874a'),
    equip: SV('M6 3h12l1 6-3 3v9H8v-9L5 9z', '#a9b0ba'),
    settings: SV('M12 8a4 4 0 100 8 4 4 0 000-8zm-1-6h2l1 3 2 1 3-1 1 2-2 2v2l2 2-1 2-3-1-2 1-1 3h-2l-1-3-2-1-3 1-1-2 2-2v-2L3 9l1-2 3 1 2-1z', '#c8c0b0'),
    prayer: SV('M12 2l2 4h-1v3h4v2h-4v8l3 3H8l3-3v-8H7V9h4V6h-1z', '#8fd8ff'),
    magic: SV('M4 20L15 9M14 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM19 10l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z', '#b48aff')
  };
  /* the prayer book's pictures (2026-10-07): the three overheads have their own, the rest borrow the skill they boost */
  const PRAY_ICON = {
    magic: SV('M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z', '#7ab8ff'),
    missiles: SV('M3 21l12-12M15 9l-1-5 7-1-1 7-5-1zM3 21l1-4 3 3z', '#9ad070'),
    melee: SV('M14 3l7 0 0 7-9 9-3-3-2 2 1 2-2 2-4-4 2-2 2 1 2-2-3-3z', '#e0e0ea'),
    restore: SV('M12 3a9 9 0 109 9h-3a6 6 0 11-6-6v3l5-4.5L12 0z', '#c0e070'), item: SV('M5 10h14v11H5zM8 10V7a4 4 0 018 0v3', '#e8c060'),
    retribution: SV('M12 2l3 7 7 1-5 5 2 7-7-4-7 4 2-7-5-5 7-1z', '#ff9040'), redemption: SV('M12 21l-8-8a5 5 0 017-7l1 1 1-1a5 5 0 017 7zM12 8v7M8.5 11.5h7', '#ffe070'),
    smite: SV('M13 2L5 14h6l-2 8 10-13h-6l2-7z', '#d070ff')
  };
  const PRAY_FOR = { att: 'attack', str: 'strength', def: 'defence', rng: 'ranged', mag: 'magic', heal: 'hitpoints' };
  const SKI = {
    attack: SV('M3 21l4-1 11-11 2-6-6 2L3 16z', '#c8c8d0'), strength: SV('M5 12c0-4 3-7 7-7s5 2 5 5v4l3 2-1 4H7c-2 0-2-3-2-8z', '#d8a070'),
    defence: SV('M12 2l8 3v6c0 6-4 9-8 11-4-2-8-5-8-11V5z', '#7a8ad0'), hitpoints: SV('M12 21l-8-8a5 5 0 017-7l1 1 1-1a5 5 0 017 7z', '#e04040'),
    ranged: SV('M4 20L20 4M6 3c8 1 14 7 15 15M14 4h6v6', '#8ac060'), magic: SV('M12 2l2 7h7l-6 4 2 8-5-5-5 5 2-8-6-4h7z', '#6aa0ff'),
    woodcutting: SV('M4 20l9-9M11 5l6-2 3 3-2 6-7-7z', '#a07a48'), mining: SV('M4 20l10-10M5 7c5-5 11-5 14-2-4-1-8 0-10 3z', '#9a9a9a'),
    dexterity: SV('M4 20c6-2 9-7 10-16 2 5 1 9-2 12l6 1-3 3H4z', '#9ad0b0'), speechcraft: SV('M3 4h18v12H9l-5 4v-4H3z', '#e8c8f0'),
    fishing: SV('M2 12c4-5 10-6 15-2l4-3v10l-4-3c-5 4-11 3-15-2z', '#60a0d0'), cooking: SV('M4 10h16v3c0 5-3 8-8 8s-8-3-8-8zm4-6c0 2 2 2 2 4m4-4c0 2 2 2 2 4', '#d0a040'),
    firemaking: SV('M12 2c3 4 6 6 6 11a6 6 0 01-12 0c0-3 2-5 3-7 1 2 1 3 3 4 0-3-1-5 0-8z', '#ff8a30'),
    prayer: SV('M12 2l2 4h-1v3h4v2h-4v8l3 3H8l3-3v-8H7V9h4V6h-1z', '#8fd8ff')
  };
  const SKILL_ORDER = ['attack', 'hitpoints', 'strength', 'ranged', 'defence', 'magic', 'prayer', 'dexterity', 'speechcraft', 'woodcutting', 'mining', 'fishing', 'cooking', 'firemaking'];
  const SKILL_INFO = { attack: 'Hit more often in melee. Trained by the Accurate style.', strength: 'Hit harder in melee and carry 1 kg more per level. Trained by the Aggressive style.',
    defence: 'Get hit less often by everything. Trained by the Defensive style (and Longrange or Defensive cast). Armour needs it.', hitpoints: 'Your health. Trained by every hit you land.',
    ranged: 'Bows and arrows. Trained by hitting with a bow.', magic: 'Staffs and spells. Trained by casting.', prayer: 'Prayers that protect you from blows. Your Prayer points drain while one is on; pray at the church altar to recharge. Trained by burying bones.', dexterity: 'Run longer, dodge blows, faster daggers and bows at 50.',
    speechcraft: 'Better prices in every shop. Trained by trading and by talking quests through.', woodcutting: 'Chop trees with a hatchet.', mining: 'Mine rocks with a pickaxe.',
    fishing: 'Catch fish with a net, a rod or a lobster pot.', cooking: 'Cook raw fish on a range or a campfire; burn less as you level.',
    firemaking: 'Light campfires: a tinderbox on logs. Better logs need more levels and burn longer.' };
  const START_SKILLS = [['attack', 'Hit more often in melee'], ['strength', 'Hit harder, carry 1 kg more per level'], ['defence', 'Get hit less often'], ['ranged', 'Bows and arrows'], ['magic', 'Staffs and spells'], ['hitpoints', 'More health'], ['dexterity', 'Run longer, dodge, faster daggers and bows'], ['speechcraft', 'Better prices in shops']];
  const EQ_LAYOUT = [null, 'head', null, 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'pack', 'legs', null, 'hands', 'feet', 'ring'];
  const EQ_ACTIVE = { head: 1, cape: 1, pack: 1, ammo: 1, weapon: 1, body: 1, shield: 1, legs: 1, ring: 1 };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtN = n => n >= 1e7 ? [Math.floor(n / 1e6) + 'M', 'm'] : n >= 1e5 ? [Math.floor(n / 1e3) + 'K', 'k'] : [String(n), ''];
  const prayIcon = (q) => PRAY_ICON[q.icon] || PRAY_ICON[q.id.replace(/^protect_/, '')] || (PRAY_FOR[q.g] && SKI[PRAY_FOR[q.g]]) || PRAY_ICON[q.g] || PRAY_ICON[q.id] || ICON.prayer;
  /* HOME THEMES (2026-10-09: "change the hud for ziibiing ... make the icons Native American themed instead of medieval
     themed"). A home's rules say which theme its players see (rules.homes.<h>.hud); the theme swaps the tab and skill icons and
     restyles the panels. Ziibiing: smoked deer hide with a beadwork edge, ribbon red, and the village's own things - the
     tomahawk, the bow, a makak (birch bark box), a ribbon shirt, asemaa (tobacco), a snowshoe, the moon. Nothing sacred
     (no dreamcatchers, no medicine wheel) is used as decoration. */
  const BEADS = 'repeating-linear-gradient(90deg,#b8322a 0 4px,#f3ede0 4px 8px,#2f6aa8 8px 12px,#f3ede0 12px 16px,#e2a93a 16px 20px,#f3ede0 20px 24px)';
  const THEMES = {
    ziibiing: {
      ICON: {
        combat: SV('M3 19.5l1.5 1.5 11-11-1.5-1.5zM12.5 6.5c1.5-3 5-4.5 8-3.5-.5 3-2 5.5-4.5 6.5z', '#d9c9a0'),                       // a tomahawk
        skills: SV('M12 3a3 3 0 010 6 3 3 0 010-6zM6 9a3 3 0 010 6 3 3 0 010-6zM18 9a3 3 0 010 6 3 3 0 010-6zM12 15a3 3 0 010 6 3 3 0 010-6zM12 10.5a1.5 1.5 0 010 3 1.5 1.5 0 010-3z', '#e2a93a'),   // a beaded flower
        quest: SV('M4 4c2 1 4-1 6 0s4-1 6 0 3-1 4 0v16c-1-1-2 1-4 0s-4 1-6 0-4 1-6 0zM8 9l2 3 2-3 2 3M8 15h8', '#efe8d8'),               // birch bark with marks
        friends: SV('M8 11a3 3 0 100-6 3 3 0 000 6zM2 19c0-3 2.5-5 6-5s6 2 6 5M16 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM14 14c2.8 0 6 1.6 6 4.5M6 8v6M10 8v6', '#7dcea0'),
        wallet: SV('M5 2l7 8 7-8M6 10h12l-1 11H7zM9 14h6M10 17h4', '#2f6aa8'),                                                     // a bandolier bag
        inv: SV('M4 6h16v3H4zM5 9h14l-1.5 12h-11zM12 12a2 2 0 010 4 2 2 0 010-4z', '#d8c8a0'),                                       // a makak, quill flower
        equip: SV('M8 3L3 6l2 5 3-1v11h8V10l3 1 2-5-5-3c-1 2-2 2-4 2S9 5 8 3zM8 14h8M8 17h8', '#b8322a'),                           // a ribbon shirt
        prayer: SV('M12 2c5 3 7.5 8 4.5 14L12 22l-4.5-6C4.5 10 7 5 12 2zM12 6v14M12 11l-3-2M12 14l3-2', '#8fcf6a'),               // asemaa (tobacco) leaf
        magic: SV('M15 3a9 9 0 100 18 7 7 0 010-18zM19 5l.6 1.6 1.6.6-1.6.6L19 9.4l-.6-1.6-1.6-.6 1.6-.6z', '#9fb8ff'),           // the moon and a star
        settings: SV('M12 2c4 0 6 4 6 10s-2 10-6 10-6-4-6-10S8 2 12 2zM8 8h8M7.5 12h9M8 16h8M10 4v16M14 4v16', '#c8a878')           // a snowshoe
      },
      SKI: {
        attack: SV('M3 20l1.5 1.5 10-10-1.5-1.5zM15.5 3a4 4 0 110 8 4 4 0 010-8z', '#c8b090'),                                          // a ball-headed war club
        strength: SV('M11 2h2v11c2 1 3 4 2 7l-3 2-3-2c-1-3 0-6 2-7z', '#d8a070'),                                                      // a canoe paddle
        defence: SV('M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v10M7 12h10', '#a07850'),                                                   // a hide shield
        ranged: SV('M6 3c8 2 13 8 15 15M6 3L21 18M3 21l15-15M15 4h4v4', '#8ac060'),                                                    // a bow and arrow
        magic: SV('M15 3a9 9 0 100 18 7 7 0 010-18z', '#9fb8ff'),
        woodcutting: SV('M3 19.5l1.5 1.5 11-11-1.5-1.5zM12.5 6.5c1.5-3 5-4.5 8-3.5-.5 3-2 5.5-4.5 6.5z', '#a07a48'),
        mining: SV('M5 15l4-9 7-2 4 6-2 8-8 2zM9 9l4 3M13 12l3-4', '#4a4a52'),                                                      // obsidian
        dexterity: SV('M12 2c4 0 6 4 6 10s-2 10-6 10-6-4-6-10S8 2 12 2zM8 8h8M7.5 12h9M8 16h8', '#9ad0b0'),                          // a snowshoe
        cooking: SV('M5 10h14c0 6-3 10-7 10s-7-4-7-10zM5 10c2-5 12-5 14 0M12 2v4', '#d0a040'),                                      // akik (a kettle)
        prayer: SV('M12 2c5 3 7.5 8 4.5 14L12 22l-4.5-6C4.5 10 7 5 12 2zM12 6v14', '#8fcf6a')
      },
      css: `
.ash.th-ziibiing .stone{background:linear-gradient(#6e4c2f,#4c321d);border:2px solid #24160b;box-shadow:inset 0 0 0 1px #a07a50,0 2px 6px #0008}
.ash.th-ziibiing .panel.stone,.ash.th-ziibiing .chat.stone{border-top:4px solid transparent;border-image:${BEADS} 4 0 0 0 / 4px 0 0 0}
.ash.th-ziibiing .tab.on{background:linear-gradient(#a8302a,#7a1f1a);box-shadow:inset 0 0 0 1px #f3ede0}
.ash.th-ziibiing .slot,.ash.th-ziibiing .pry{background:#3a2615;box-shadow:inset 0 0 0 1px #7a5634}
.ash.th-ziibiing .mm,.ash.th-ziibiing .compass{border-color:#24160b;box-shadow:0 0 0 2px #a07a50,0 3px 8px #000a}
`
    }
  };
  let CSS_NOW = CSS;
  function useTheme(name) { const T = THEMES[name]; if (!T) return null; Object.assign(ICON, T.ICON || {}); Object.assign(SKI, T.SKI || {}); CSS_NOW = CSS + (T.css || ''); art.CSS = CSS_NOW; return 'th-' + name; }
  const art = { CSS, SPLAT_RED, SPLAT_BLUE, SV, ICON, SKI, PRAY_ICON, prayIcon, SKILL_ORDER, SKILL_INFO, START_SKILLS, EQ_LAYOUT, EQ_ACTIVE, cap, esc, fmtN, useTheme, THEMES };
  if (G.ASH3D && G.ASH3D.define) G.ASH3D.define('hudart', { api: 1, v: 1 }, () => art);
})(typeof globalThis !== 'undefined' ? globalThis : this);
