#!/usr/bin/env python3
import asyncio
import json
import subprocess
import time
import urllib.request
import websockets

BACKEND = "http://localhost:4000"
FRONTEND = "http://localhost:3000"

def api_post(path, data, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BACKEND}{path}", data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

async def cdp_eval(ws, expr):
    msg_id = int(time.time() * 1000) % 1000000
    payload = {
        "id": msg_id,
        "method": "Runtime.evaluate",
        "params": {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True
        }
    }
    await ws.send(json.dumps(payload))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == msg_id:
            result = resp.get("result", {})
            if "exceptionDetails" in result:
                raise Exception(f"CDP eval exception: {result['exceptionDetails']}")
            return result.get("result", {}).get("value")

async def cdp_navigate(ws, url):
    msg_id = int(time.time() * 1000) % 1000000
    await ws.send(json.dumps({"id": msg_id, "method": "Page.navigate", "params": {"url": url}}))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == msg_id:
            break
    # Wait 2 seconds for load and render
    await asyncio.sleep(2)

async def main():
    print("==================================================================")
    print("      REAL CHROMIUM BROWSER VERIFICATION — TA-03 SAMPLE DATA     ")
    print("==================================================================\n")

    # 1. Create fresh test user
    ts = int(time.time())
    email = f"browser-test-{ts}@toolsagent.test"
    signup_data = api_post("/api/auth/signup", {
        "name": "Browser Test",
        "email": email,
        "password": "password123",
        "confirm_new_org": True
    })
    token = signup_data["token"]
    print(f"✓ Created fresh user {email} with sample data")

    # 2. Launch headless Chrome
    chrome_proc = subprocess.Popen([
        "/usr/bin/google-chrome-stable",
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--remote-debugging-port=9222"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)

    try:
        # Get page websocket url
        targets = json.loads(urllib.request.urlopen("http://localhost:9222/json").read().decode("utf-8"))
        page_target = next(t for t in targets if t.get("type") == "page")
        ws_url = page_target["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url) as ws:
            # Enable Page & Runtime
            await ws.send(json.dumps({"id": 1, "method": "Page.enable"}))
            await ws.send(json.dumps({"id": 2, "method": "Runtime.enable"}))

            # Navigate to frontend and set token
            await cdp_navigate(ws, f"{FRONTEND}/login")
            await cdp_eval(ws, f"""
                localStorage.setItem('ts_token', '{token}');
                sessionStorage.setItem('ts_token', '{token}');
            """)

            # Navigate to /observe
            print("\n--- 1. Testing Observe Screen (Populated with Sample Data) ---")
            await cdp_navigate(ws, f"{FRONTEND}/observe")
            # Wait for data fetch
            await asyncio.sleep(2)

            # Check for Sample Banner
            badge_text = await cdp_eval(ws, """
                (() => {
                    const el = document.body;
                    return {
                        hasSampleBadge: el.innerText.includes('SAMPLE DATA'),
                        hasSampleExpl: el.innerText.includes('You are viewing realistic sample traces to preview dashboard capabilities'),
                        hasClearBtn: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Clear sample data')),
                        hasSupportAgent: el.innerText.includes('support-agent'),
                        hasCodeReviewer: el.innerText.includes('code-reviewer'),
                        hasLoopAlert: el.innerText.includes('Tool Loop Flagged')
                    };
                })()
            """)
            print("✓ Observe screen DOM assertions:")
            print(f"  - 'SAMPLE DATA' badge present: {badge_text['hasSampleBadge']}")
            print(f"  - Sample explanation text present: {badge_text['hasSampleExpl']}")
            print(f"  - 'Clear sample data' button present: {badge_text['hasClearBtn']}")
            print(f"  - Populated agent 'support-agent' in DOM: {badge_text['hasSupportAgent']}")
            print(f"  - Populated agent 'code-reviewer' in DOM: {badge_text['hasCodeReviewer']}")
            print(f"  - Flagged tool loop alert banner present: {badge_text['hasLoopAlert']}")

            assert badge_text['hasSampleBadge'], "SAMPLE DATA badge not found in DOM!"
            assert badge_text['hasClearBtn'], "Clear sample data button not found!"
            assert badge_text['hasSupportAgent'], "Sample agents not found!"

            # Extract outer HTML of the Sample Banner for evidence
            banner_html = await cdp_eval(ws, """
                (() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Clear sample data'));
                    return btn ? btn.parentElement.outerHTML : 'NOT_FOUND';
                })()
            """)
            print("\n[EVIDENCE] Rendered Sample Badge DOM snippet:")
            print(banner_html[:350] + "...")

            # 3. Click 'Clear sample data'
            print("\n--- 2. Clicking 'Clear sample data' in real browser ---")
            await cdp_eval(ws, """
                (() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Clear sample data'));
                    if (btn) btn.click();
                })()
            """)
            await asyncio.sleep(2)

            # Verify Observe screen after clearing
            after_clear = await cdp_eval(ws, """
                (() => {
                    const el = document.body;
                    return {
                        hasSampleBadge: el.innerText.includes('SAMPLE DATA'),
                        hasOnboardingTitle: el.innerText.includes('No real traces recorded yet'),
                        hasSendTracePath: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Send a trace') || b.innerText.includes('Send trace')),
                        hasReloadPath: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Reload sample data')),
                        hasNoTracesYet: el.innerText.includes('No traces yet')
                    };
                })()
            """)
            print("✓ Observe screen DOM assertions after clear:")
            print(f"  - Sample badge disappeared: {not after_clear['hasSampleBadge']}")
            print(f"  - Empty onboarding card present: {after_clear['hasOnboardingTitle']}")
            print(f"  - Path 1 ('+ Send a trace') present: {after_clear['hasSendTracePath']}")
            print(f"  - Path 2 ('⟳ Reload sample data') present: {after_clear['hasReloadPath']}")
            print(f"  - Panels show honest empty state: {after_clear['hasNoTracesYet']}")

            assert not after_clear['hasSampleBadge'], "Sample badge did not disappear after clear!"
            assert after_clear['hasSendTracePath'], "Path 1 (connect real source) not found!"
            assert after_clear['hasReloadPath'], "Path 2 (reload sample data) not found!"

            # Extract outer HTML of the empty onboarding card for evidence
            onboarding_html = await cdp_eval(ws, """
                (() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Reload sample data'));
                    return btn ? btn.closest('div[style*="border: 1px dashed"]').outerHTML : 'NOT_FOUND';
                })()
            """)
            print("\n[EVIDENCE] Rendered Empty State (Two Clear Paths) DOM snippet:")
            print(onboarding_html[:350] + "...")

            # 4. Navigate to /spend
            print("\n--- 3. Testing Spend Screen Empty State & Reload ---")
            await cdp_navigate(ws, f"{FRONTEND}/spend")
            await asyncio.sleep(2)

            spend_empty = await cdp_eval(ws, """
                (() => {
                    const el = document.body;
                    return {
                        hasSampleBadge: el.innerText.includes('SAMPLE DATA'),
                        hasSpendOnboarding: el.innerText.includes('No real spend recorded yet'),
                        hasAddKeyPath: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Add Provider Key')),
                        hasReloadPath: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Reload sample data'))
                    };
                })()
            """)
            print("✓ Spend screen DOM assertions (Empty state):")
            print(f"  - Sample badge absent: {not spend_empty['hasSampleBadge']}")
            print(f"  - Spend onboarding title present: {spend_empty['hasSpendOnboarding']}")
            print(f"  - Path 1 ('+ Add Provider Key') present: {spend_empty['hasAddKeyPath']}")
            print(f"  - Path 2 ('⟳ Reload sample data') present: {spend_empty['hasReloadPath']}")

            assert spend_empty['hasAddKeyPath'], "Path 1 (+ Add Provider Key) missing!"
            assert spend_empty['hasReloadPath'], "Path 2 (Reload sample data) missing!"

            # 5. Click 'Reload sample data' on Spend screen
            print("\n--- 4. Clicking 'Reload sample data' on Spend screen ---")
            await cdp_eval(ws, """
                (() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Reload sample data'));
                    if (btn) btn.click();
                })()
            """)
            await asyncio.sleep(2)

            spend_reloaded = await cdp_eval(ws, """
                (() => {
                    const el = document.body;
                    return {
                        hasSampleBadge: el.innerText.includes('SAMPLE DATA'),
                        hasSampleExpl: el.innerText.includes('You are viewing realistic sample spend to preview dashboard capabilities'),
                        hasClaudeSonnet: el.innerText.includes('claude-3-5-sonnet'),
                        hasGpt4o: el.innerText.includes('gpt-4o'),
                        hasWasteFinder: el.innerText.includes('Waste Finder')
                    };
                })()
            """)
            print("✓ Spend screen DOM assertions after reload:")
            print(f"  - 'SAMPLE DATA' badge reappeared: {spend_reloaded['hasSampleBadge']}")
            print(f"  - Sample spend explanation present: {spend_reloaded['hasSampleExpl']}")
            print(f"  - Populated model 'claude-3-5-sonnet' present: {spend_reloaded['hasClaudeSonnet']}")
            print(f"  - Populated model 'gpt-4o' present: {spend_reloaded['hasGpt4o']}")
            print(f"  - Populated Waste Finder present: {spend_reloaded['hasWasteFinder']}")

            assert spend_reloaded['hasSampleBadge'], "SAMPLE DATA badge did not reappear!"
            assert spend_reloaded['hasClaudeSonnet'], "Populated models missing!"

            print("\n==================================================================")
            print("      ALL REAL CHROMIUM BROWSER ASSERTIONS PASSED 100%!           ")
            print("==================================================================")

    finally:
        chrome_proc.terminate()

if __name__ == "__main__":
    asyncio.run(main())
