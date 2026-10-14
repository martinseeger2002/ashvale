"""Browser regression for Vael's first planting step.

Run against a locally served build. ASH_TEST_URL may override the default.
"""
import os
from playwright.sync_api import sync_playwright


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get(
    "ASH_TEST_URL",
    "http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&seed=even-grove-pw&go=197,-68",
)
OUT = os.path.join(ROOT, "tests", "shots", "even_grove_quest.png")
ARGS = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
]


def check(condition, message, failures):
    print(("ok   " if condition else "FAIL ") + message)
    if not condition:
        failures.append(message)


with sync_playwright() as playwright:
    failures = []
    browser = playwright.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.set_default_timeout(15000)
    page.on("pageerror", lambda error: failures.append("PAGEERROR " + str(error)))
    page.goto(URL)
    page.wait_for_function("window.ASH && ASH.me && ASH.core && ASH.hud", timeout=30000)
    page.wait_for_timeout(1200)

    setup = {"near": [[181, -67], [182, -67], [183, -67]], "far": [176, -74]}
    available = page.evaluate("""({near, far}) => {
      const help = document.querySelector('.help'); if (help) help.remove();
      ASH.me.quests.even_grove = { step: 2, n: 0 };
      ASH.give('sapling', 3);
      return { near: near.every(([x, y]) => ASH.core.canPlant(ASH.me, x, y)), far: ASH.core.canPlant(ASH.me, far[0], far[1]) };
    }""", setup)
    check(available["near"], "three qualifying grove tiles are available", failures)
    check(available["far"], "a valid non-quest planting tile is available", failures)

    result = page.evaluate("""async ({near, far}) => {
      const c = ASH.core, p = ASH.me;
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const stand = ([x, y]) => {
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]]) {
          if (!c.M.blocked(x + dx, y + dy)) { ASH.teleport(x + dx, y + dy); return; }
        }
      };
      const plant = async xy => { stand(xy); c.cmd(ASH.pid, { c: 'plant', x: xy[0], y: xy[1] }); await wait(900); };
      const before = c.invCount(p, 'sapling');
      await plant(far);
      const farState = { saplings: c.invCount(p, 'sapling'), count: p.quests.even_grove.n | 0 };
      ASH.hud.setTab('inv'); ASH.hud.setTab('quest');
      await wait(300);
      const beforePanel = document.querySelector('.ash .panel');
      const beforeQuestText = beforePanel ? beforePanel.textContent : '';
      for (const xy of near) await plant(xy);
      ASH.hud.setTab('inv'); ASH.hud.setTab('quest');
      await wait(300);
      const panel = document.querySelector('.ash .panel');
      return {
        before,
        farState,
        finalCount: p.quests.even_grove.n | 0,
        saplings: c.invCount(p, 'sapling'),
        beforeQuestText,
        questText: panel ? panel.textContent : '',
        chatText: [...document.querySelectorAll('.chat div')].map(d => d.textContent).join(' | '),
      };
    }""", setup)

    check(
        result["farState"]["saplings"] == result["before"] and result["farState"]["count"] == 0,
        "an out-of-area attempt preserves the quest sapling and progress",
        failures,
    )
    check(
        "within sixteen tiles" in result["chatText"],
        "the browser explains exactly why the rejected planting did not count",
        failures,
    )
    check(
        result["finalCount"] == 3,
        "three valid browser plant actions advance Vael to 3/3",
        failures,
    )
    check(
        "near Vael" in result["beforeQuestText"] and "0/3" in result["beforeQuestText"] and "Return to Vael" in result["questText"],
        "the quest panel shows the planting location, then sends the player back to Vael",
        failures,
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    page.screenshot(path=OUT)
    print("     shot", OUT)
    browser.close()

print(str(len(failures)) + " FAILED" if failures else "all passed")
raise SystemExit(1 if failures else 0)
