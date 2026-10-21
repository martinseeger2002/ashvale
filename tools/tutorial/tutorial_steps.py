"""tutorial_steps.py - Tutorial Island's stations, its guides and their words (2026-10-19). Read by make_tutorial_extras.py (the data) and
make_tutorial.js reads npcs.json, which that writes. The operator: "work on that plan" - every station of the OSRS tutorial, watered down -
and "make sure dialogue is straight forward - congratulate them and make them feel good about coming to play". Plain words, one thing at a
time, the exact clicks, and a cheer at every step. `hint` is what the goal box at the top of the screen says (src/engine.js TUTORIAL GUIDE).
The new stations' lines were drafted by the local Qwen model (tools/tutorial/qwen_stations.json) and edited.

Order (after OSRS): the guide, survival (fire, a shrimp), farming, the quest journal, mining, combat (wield, rats, eat, a bow, a staff), the
bank chest, the wallet, the shop, the chapel (bury, pray), the ferry. Goals: talk, light, cook, harvest, bring, kill and `do` (src/core.js
DO goal: equip, eat, bury, pray, buy, sell, ranged, magic, bank_in, bank_out, and the client's journal and wallet).
"""
G, S, F, C, X = "tut_guide", "tut_survival", "tut_farmer", "tut_combat", "tut_ferryman"
QG, MI, BK, WA, SH, CH = "tut_quest", "tut_mining", "tut_banker", "tut_wallet", "tut_shop", "tut_chapel"
NPCS = {   # id: name, examine
    G: ("Guide Elsbeth", "An island guide with a whistle, a clipboard and the patience of someone who has explained walking a thousand times."),
    S: ("Survivalist Marlow", "Survivalist Marlow. He can light a fire with two wet sticks and a strong opinion."),
    F: ("Gardener Fen", "Gardener Fen, the island's gardener. There is soil under every fingernail and a radish in every pocket."),
    QG: ("Loremaster Ilse", "Loremaster Ilse keeps the island's book of stories, and knows how every one of them ends."),
    MI: ("Prospector Dunn", "Prospector Dunn, who talks to rocks. The rocks, he says, talk back."),
    C: ("Sergeant Kade", "Sergeant Kade. Shouts like a drill sergeant, which he was, and smiles like a grandfather, which he is."),
    BK: ("Banker Corin", "Banker Corin, who keeps the island's chest and has never lost so much as a button."),
    WA: ("Ledger-keeper Asha", "Ledger-keeper Asha. She knows where every coin in the valley is, and whose it really is."),
    SH: ("Trader Milo", "Trader Milo, who will sell you anything and buy almost everything back."),
    CH: ("Brother Aldo", "Brother Aldo of the island chapel, calm as a still pond."),
    X: ("Ferryman Odo", "Ferryman Odo. He has rowed every new face in the valley to Ashvale, and remembers most of them."),
}
LOOKS_NEW = {
    QG: {"outfit": {"skin": "#e8c8a8", "hair": "long", "hairColor": "#5a3a5a", "shirt": {"style": "robe", "color": "#6a3a7a"}, "pants": {"style": "robe", "color": "#6a3a7a"}, "boots": "#2a1a2a", "belt": "#c8a040"}},
    MI: {"build": "big", "gear": {"weapon": "pickaxe"}, "outfit": {"skin": "#b88a60", "hair": "short", "hairColor": "#8a8a8a", "beard": "full", "beardColor": "#9a9a9a", "shirt": {"style": "vest", "color": "#6a5a4a"}, "pants": {"style": "trousers", "color": "#3a3a3a"}, "boots": "#2a1a10", "belt": "#5a4a2a", "hat": {"style": "cap", "color": "#c8a040"}}},
    BK: {"outfit": {"skin": "#d8b090", "hair": "short", "hairColor": "#2a2a2a", "shirt": {"style": "tunic", "color": "#2a3a5a"}, "pants": {"style": "trousers", "color": "#1a1a2a"}, "boots": "#1a1a1a", "belt": "#d8b040"}},
    WA: {"outfit": {"skin": "#a87850", "hair": "braids", "hairColor": "#1a1a1a", "shirt": {"style": "tunic", "color": "#3a7a6a"}, "pants": {"style": "skirt", "color": "#2a4a4a"}, "boots": "#2a1a10", "belt": "#d8b040"}},
    SH: {"outfit": {"skin": "#e0b088", "hair": "short", "hairColor": "#a8642a", "beard": "stubble", "beardColor": "#a8642a", "shirt": {"style": "tunic", "color": "#a85a2a"}, "pants": {"style": "trousers", "color": "#4a3a2a"}, "boots": "#3a2a1a", "apron": "#d8c8a0"}},
    CH: {"outfit": {"skin": "#d8a878", "hair": "bald", "hairColor": "#8a8a8a", "beard": "full", "beardColor": "#c8c8c8", "shirt": {"style": "robe", "color": "#6e4a2c"}, "pants": {"style": "robe", "color": "#6e4a2c"}, "boots": "#2a1a10", "belt": "#c8a860"}},
}
DOS = ["equip", "eat", "bury", "pray", "buy", "sell", "ranged", "magic", "bank_in", "bank_out", "journal", "wallet"]
CLIENT_DOS = ["journal", "wallet", "bank_in", "bank_out"]   # bank_in/out from the client only on the dev build without a wallet (src/engine.js case chest)
SHOP = {"tut_shop": {"name": "Milo's Island Stall", "keeper": SH, "stock": ["bread", "shrimp", "potion", "arrows_t1"], "buys": "any", "buyRate": 50, "sellRate": 100,
                     "greet": "Welcome, welcome! Click something on my shelf to buy it, or something in your pack to sell it. Easy as that."}}

# (goal, ends, talk lines when the step starts, hint, complete lines, reward, kit)
STEPS = [
    ({"talk": G}, G, ["Welcome to the valley!", "Guide Elsbeth is right beside you."],
     "Click <b>Guide Elsbeth</b>, under the gold arrow, to say hello.",
     ["Hello, and welcome! We're so glad you've come. I'm Elsbeth, and I'll help you find your feet.",
      "To walk, click on the ground. To talk to someone, click on them - just like you did with me! The box at the top always says what to do next."],
     "xp:dexterity:50", None),
    ({"talk": S}, S, ["Your first stop is Survivalist Marlow, by the trees to the west.", "Follow the gold arrow above his head. Off you go!"],
     "Follow the gold arrow to <b>Survivalist Marlow</b> and click him.",
     ["Hello there! Elsbeth said a new friend was coming. Welcome - you're going to love it here."], "xp:dexterity:50", None),
    ({"light": "*", "n": 1}, S, ["Let's start with a campfire. I've put a hatchet and a tinderbox in your pack - the bag button on the right shows your pack.",
                                 "Click a tree to chop some logs. Then click the logs in your pack and choose Light."],
     "Click a <b>tree</b> to chop logs. Then click the <b>logs</b> in your pack and choose <b>Light</b>.",
     ["Look at that - your very first fire! Well done. Every adventurer remembers their first fire."], ["xp:woodcutting:100", "xp:firemaking:100"], {"hatchet": 1, "tinderbox": 1}),
    ({"cook": "shrimp", "n": 1}, S, ["Now let's catch some dinner. Here's a fishing net.", "Click the bubbling water on the shore to catch a shrimp, then click your fire to cook it."],
     "Click the <b>bubbling water</b> to catch a shrimp. Then click your <b>fire</b> to cook it.",
     ["Perfectly cooked! You're a natural."], ["xp:fishing:100", "xp:cooking:100"], {"net": 1}),
    ({"harvest": "radish", "n": 2}, F, ["Gardener Fen's garden is just to the north. I've put a rake, a seed dibber, a spade and two radish seeds in your pack.",
                                        "Click the farming patch there: Rake it, Plant a seed, wait a moment, then Harvest."],
     "Click the <b>farming patch</b>: <b>Rake</b>, then <b>Plant</b> a radish seed, wait, then <b>Harvest</b>. Grow 2 radishes.",
     ["Two radishes, grown by you! Brilliant. There are farming patches all along the valley's roads, and every one can be yours."], "xp:farming:150",
     {"rake": 1, "seed_dibber": 1, "spade": 1, "radish_seed": 2}),
    ({"do": "journal"}, QG, ["Next, Loremaster Ilse, by the big stone. She looks after the quest journal.",
                             "Click the Quests button on the right - the one that looks like a scroll - to open it, then go and see her."],
     "Click the <b>Quests</b> button on the right (the scroll), then talk to <b>Loremaster Ilse</b>.",
     ["That's your quest journal! A quest is a story told in steps. The journal always shows the step you're on, so you never get lost.",
      "Every quest you finish earns story points. You're already on your first one - this island!"], "xp:speechcraft:100", None),
    ({"bring": "copper_ore", "n": 1}, MI, ["Prospector Dunn is digging by the rocks to the south. Take him this pickaxe.",
                                           "Click a copper rock to mine some ore, then bring it to Dunn."],
     "Click a <b>copper rock</b> to mine one copper ore. Then talk to <b>Prospector Dunn</b>.",
     ["Lovely bit of copper! Ore is how you'll make things one day. You're a miner now, too."], "xp:mining:150", {"pickaxe": 1}),
    ({"do": "equip"}, C, ["Sergeant Kade is waiting to the east, by the rats. He sent you this sword.",
                          "Click the sword in your pack and choose Wield. The Equipment button - the shirt - shows what you're holding and wearing."],
     "Click the <b>sword</b> in your pack and choose <b>Wield</b>. Then talk to <b>Sergeant Kade</b>.",
     ["There - armed and ready! Now let's put that sword to work."], "xp:attack:100", {"sword_t1": 1}),
    ({"kill": "tut_rat", "n": 2}, C, ["See those island rats? Click one to fight it. Your sword does the rest.", "Defeat two, then come back to me."],
     "Click an <b>island rat</b> to fight it. Defeat <b>2 rats</b>, then talk to <b>Sergeant Kade</b>.",
     ["Ha! Two rats, and barely a scratch on you. You fight like a hero already!"], ["xp:attack:150", "xp:strength:150", "xp:defence:150"], None),
    ({"do": "eat"}, C, ["Fighting is hungry work. Your health is the red circle at the top right.",
                        "Click the bread in your pack and choose Eat - food heals you whenever you're hurt."],
     "Click the <b>bread</b> in your pack and choose <b>Eat</b>. Then talk to <b>Sergeant Kade</b>.",
     ["Good! Always eat before your health gets low. That's the best advice I've got."], "xp:hitpoints:100", {"bread": 1}),
    ({"do": "ranged"}, C, ["Now, from a distance. Here's a bow and some arrows.", "Wield the bow, then click a rat to shoot it."],
     "Click the <b>bow</b> in your pack and choose <b>Wield</b>. Then click a <b>rat</b> to shoot it.",
     ["A fine shot! Bows let you fight from far away."], "xp:ranged:150", {"bow_t1": 1, "arrows_t1": 40}),
    ({"do": "magic"}, C, ["And last, magic. Here's a staff - no spellbook needed.", "Wield the staff and click a rat to cast a spell at it."],
     "Click the <b>staff</b> in your pack and choose <b>Wield</b>. Then click a <b>rat</b> to cast a spell.",
     ["Magic! You've tried every way to fight - sword, bow and staff. Keep whichever you like best. I'm proud of you."], "xp:magic:150", {"staff_t1": 1}),
    ({"do": "bank_in"}, BK, ["Banker Corin keeps the chest by the jetty. He'll show you how to keep your things safe.",
                             "Click the chest, then click something in your pack to put it in."],
     "Click the <b>bank chest</b>, then click an item in your pack to put it in. Then talk to <b>Banker Corin</b>.",
     ["Safely stored! The chest keeps your things even when your pack is full."], "xp:speechcraft:100", None),
    ({"do": "bank_out"}, BK, ["Now take it back out. Click the chest, then click the item in the chest.", "Don't worry - nothing gets lost in there."],
     "Click the <b>bank chest</b> and click the item to take it back out. Then talk to <b>Banker Corin</b>.",
     ["Back in your pack! There's a chest like this in every town in the valley, and they're all yours."], "xp:speechcraft:100", None),
    ({"do": "wallet"}, WA, ["Ledger-keeper Asha is beside the chest. She'll explain your wallet.",
                            "Click the bank chest once more - your wallet is shown there: your address and what you own."],
     "Click the <b>bank chest</b> to see your <b>wallet</b>. Then talk to <b>Ledger-keeper Asha</b>.",
     ["That's your wallet: your address, and the things that are truly yours. 'Kept on chain' means they're recorded on the blockchain - they belong to you, not to the game.",
      "Please back up your wallet: write down your recovery words, keep them somewhere safe, and never share them with anyone - not even me.",
      "One more thing: right now the valley runs on a test network, so coins and items have no real money value yet. Enjoy learning!"], "xp:speechcraft:150", None),
    ({"do": "buy"}, SH, ["Trader Milo runs the stall by the path. Let's do some shopping.", "Click Milo and choose Trade, then click something on his shelf to buy it."],
     "Click <b>Trader Milo</b>, choose <b>Trade</b>, and click something on his shelf to <b>buy</b> it.",
     ["A fine purchase! Shops all over the valley work just the same."], "xp:speechcraft:100", None),
    ({"do": "sell"}, SH, ["Now sell me something back - anything you don't need. Click it in your pack while my shop is open.", "Even a radish is worth a coin or two to me!"],
     "Open <b>Trader Milo's</b> shop again and click something in your pack to <b>sell</b> it.",
     ["Pleasure doing business! Selling what you don't need is how you'll earn coins."], "xp:speechcraft:100", None),
    ({"do": "bury"}, CH, ["Brother Aldo keeps the little chapel to the north-east. Take these bones to him.",
                          "Click the bones in your pack and choose Bury - it trains your Prayer."],
     "Click the <b>bones</b> in your pack and choose <b>Bury</b>. Then talk to <b>Brother Aldo</b>.",
     ["Well done. Burying bones trains your Prayer, and prayers protect you in a fight."], "xp:prayer:100", {"bones": 1}),
    ({"do": "pray"}, CH, ["Open the Prayer button on the right, and click a prayer to switch it on.", "Any one will do - they all help keep you safe in a fight."],
     "Click the <b>Prayer</b> button on the right and click a prayer to switch it on. Then talk to <b>Brother Aldo</b>.",
     ["There - you're protected. Prayers use prayer points; recharge them at any altar. Go in peace, friend."], "xp:prayer:100", None),
    ({"talk": X}, X, ["You've learned everything you need! Ferryman Odo is waiting at the pier in the south-east.",
                      "Follow the arrow - your adventure in Ashvale is about to begin!"],
     "Follow the arrow to <b>Ferryman Odo</b> at the pier and click him.",
     ["You did it - you've finished Tutorial Island! Everyone here is proud of you.",
      "Hop in. In Ashvale, talk to Elder Maren by the well - she has your first real quest. Welcome to the valley!"], ["coins:25", "bread:2"], None),
]

def quest():
    steps = []
    for i, (goal, ends, talk, hint, complete, reward, kit) in enumerate(STEPS):
        d = {"id": i + 1, "zone": "tutorial", "goal": goal, "ends": ends}
        if kit: d["kit"] = kit
        d.update({"reward": reward, "talk": talk, "hint": hint, "progress": [hint.replace("<b>", "").replace("</b>", "")], "complete": complete})
        steps.append(d)
    return {"tutorial_island": {"name": "Tutorial Island", "giver": G, "story": 1, "steps": steps, "done": ["You learned the basics on Tutorial Island."]}}
