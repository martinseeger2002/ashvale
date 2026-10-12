"""Open an Ashvale playtest at the Dragon Keep and preserve what Playwright saw."""

import os
from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:8731/dist/ashvale3d.html?fresh&nocreator&seed=dragon-watch&timelapse=2000"
CHROMIUM_ARGS = [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
]


with sync_playwright() as playwright:
    headed = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    browser = playwright.chromium.launch(headless=not headed, args=CHROMIUM_ARGS)
    context = browser.new_context(viewport={"width": 1280, "height": 800})
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
    page.wait_for_function("window.ASH && ASH.me && ASH.core", timeout=60_000)
    page.evaluate(
        """() => {
          ASH.hud.showHelp(false);
          ASH.teleport(-54, -93);
          ASH.weather('clear', 0, 100000);
          ASH.setCam(-0.18, 0.46, 13);
          return { x: ASH.me.x, y: ASH.me.y, zone: ASH.core.zoneOf(ASH.me.x, ASH.me.y) };
        }"""
    )
    page.wait_for_timeout(1_500)
    shots = os.path.join(os.path.dirname(__file__), "shots")
    os.makedirs(shots, exist_ok=True)
    screenshot = os.path.join(shots, "dragon_keep_playwright.png")
    trace = os.path.join(shots, "dragon_keep_playwright_trace.zip")
    page.screenshot(path=screenshot, timeout=120_000)
    context.tracing.stop(path=trace)
    print("Playwright placed the character at (-54, -93), outside the Dragon Keep ladder.", flush=True)
    print("Screenshot:", screenshot, flush=True)
    print("Trace:", trace, flush=True)
    if headed:
        print("The browser is interactive. Close its window when you are finished.", flush=True)
        while not page.is_closed():
            page.wait_for_timeout(1_000)
    else:
        browser.close()
