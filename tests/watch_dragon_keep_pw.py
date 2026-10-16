"""Open an Ashvale playtest at the Dragon Keep and preserve what Playwright saw."""

import os
from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:8732/dist/ashvale3d.html?dragonheart=1&dungeon=-1&nocreator&seed=dragon-safety&rev=20261016f"
CHROMIUM_ARGS = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
]


with sync_playwright() as playwright:
    headed = os.environ.get("ASH_HEADED") == "1"
    browser = playwright.chromium.launch(headless=not headed, args=CHROMIUM_ARGS)
    context = browser.new_context(viewport={"width": 1280, "height": 800})
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
    page.wait_for_function("window.ASH && ASH.me && ASH.core", timeout=60_000)
    page.evaluate(
        """() => {
          ASH.hud.showHelp(false);
          ASH.weather('clear', 0, 100000);
          ASH.setCam(-0.18, 0.76, 10);
          return { x: ASH.me.x, y: ASH.me.y, zone: ASH.core.zoneOf(ASH.me.x, ASH.me.y) };
        }"""
    )
    page.wait_for_timeout(1_500)
    shots = os.path.join(os.path.dirname(__file__), "shots")
    os.makedirs(shots, exist_ok=True)
    screenshot = os.path.join(shots, "dragon_keep_ladder_safety.png")
    trace = os.path.join(shots, "dragon_keep_playwright_trace.zip")
    page.screenshot(path=screenshot, timeout=120_000)
    page.evaluate("() => ASH.hud.dialog('Hatch unlocked', ['The test hatch is now unlocked.'])")
    dialog_before = page.locator('.dlg').evaluate("e => getComputedStyle(e).display")
    page.mouse.click(20, 20)
    page.wait_for_timeout(100)
    dialog_after = page.locator('.dlg').evaluate("e => getComputedStyle(e).display")
    assert dialog_before == 'block' and dialog_after == 'none'
    context.tracing.stop(path=trace)
    print("Playwright opened Dragon Heart floor -1 and inspected its emergency ladder.", flush=True)
    print("Dialogue outside-click:", dialog_before, "->", dialog_after, flush=True)
    print("Screenshot:", screenshot, flush=True)
    print("Trace:", trace, flush=True)
    if headed:
        print("The browser is interactive. Close its window when you are finished.", flush=True)
        while not page.is_closed():
            page.wait_for_timeout(1_000)
    else:
        browser.close()
