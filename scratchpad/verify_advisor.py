# Live E2E verification of the Advisor feature (plan: docs/advisor_plan.md).
# Drives the real stack: Vite frontend (3000) -> Express API (5000) -> Postgres,
# inline background job (no Redis in dev) -> real AI model (NVIDIA GPT-OSS).
#
# Checks:
#  1. Advisor nav item + page render
#  2. Goals wizard (objective -> growth/focus -> review) posts the session
#  3. Generation completes and results render (analysis, suggestions incl. a
#     curated pick, roadmap checklist)
#  4. Step check-off persists across a full page reload
#  5. Session appears in history and reopens
#
# Run: python3 scratchpad/verify_advisor.py

import json
import sys
import urllib.request

from playwright.sync_api import expect, sync_playwright

FRONTEND = "http://localhost:3000"
API = "http://localhost:5000/api"
EMAIL = "test.portfolio@example.com"
PASSWORD = "TestPortfolio123!"
GENERATION_TIMEOUT_MS = 300_000

failures = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
    if not condition:
        failures.append(name)


def api_login():
    body = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    request = urllib.request.Request(
        f"{API}/auth/login", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read())


def main():
    auth = api_login()
    check("API login for seeded portfolio user", bool(auth.get("token")))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 950})
        page.goto(FRONTEND)
        page.evaluate(
            """([token, user]) => {
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));
            }""",
            [auth["token"], auth["user"]],
        )

        # 1. Nav + page render
        page.goto(f"{FRONTEND}/dashboard/advisor")
        expect(page.get_by_role("heading", name="Advisor")).to_be_visible(timeout=20_000)
        check("Advisor page renders under /dashboard/advisor", True)
        check(
            "Sidebar shows the Advisor nav item",
            page.get_by_role("link", name="Advisor").count() > 0,
        )

        # 2. Goals wizard
        page.get_by_role("button", name="New roadmap").click()
        page.get_by_role("button", name="Build standout projects").click()
        page.get_by_role("button", name="Next", exact=True).click()
        page.get_by_role("button", name="Advance to the next level").click()
        page.fill("#advisor-focus", "embedded systems and robotics telemetry")
        page.get_by_role("button", name="Next", exact=True).click()
        expect(page.get_by_text("Ready to build your roadmap?")).to_be_visible()
        check("Wizard walks objective -> growth -> review", True)

        page.screenshot(path="scratchpad/advisor_wizard_review.png")
        page.get_by_role("button", name="Build my roadmap").click()

        # 3. Generation (real AI call through the inline job)
        expect(page.get_by_role("heading", name="Your roadmap")).to_be_visible(
            timeout=GENERATION_TIMEOUT_MS
        )
        check("Generation completed and results view rendered", True)
        page.screenshot(path="scratchpad/advisor_results.png", full_page=True)

        summary_visible = page.locator("section").filter(has_text="confidence").count() > 0
        check("Analysis summary with confidence chip renders", summary_visible)
        project_cards = page.get_by_role("heading", name="Suggested projects")
        check("Suggested projects section renders", project_cards.count() == 1)
        check(
            "A curated suggestion is badged",
            page.get_by_text("curated", exact=True).count() >= 1,
        )

        checkboxes = page.locator("input[type=checkbox]")
        step_count = checkboxes.count()
        check("Roadmap renders as a checklist", step_count >= 3, f"{step_count} steps")

        # Tutorial coverage counters for the next check: curated cards carry
        # verified links; AI cards carry found links or a composed path.
        tutorial_labels = page.get_by_text("Tutorials", exact=True).count()
        composed_labels = page.get_by_text("Learning path", exact=False).count()
        check(
            "Project cards carry tutorials or composed learning paths",
            tutorial_labels + composed_labels >= 3,
            f"{tutorial_labels} tutorial blocks, {composed_labels} composed paths",
        )

        # 4. Step check-off + persistence across reload
        done_counter = page.get_by_text("steps done", exact=False)
        before = done_counter.inner_text()
        # Controlled React checkbox: state flips only after the PATCH resolves,
        # so use click() + an assertion instead of the strict check().
        checkboxes.first.click()
        expect(page.get_by_text("1 of", exact=False)).to_be_visible(timeout=10_000)
        check("Checking a step updates the progress meter", True, f"'{before}' -> '1 of …'")

        page.reload()
        expect(page.get_by_role("heading", name="Advisor")).to_be_visible(timeout=20_000)

        # 5. History + reopen with persisted progress
        ready_rows = page.get_by_text("ready", exact=True)
        expect(ready_rows.first).to_be_visible(timeout=15_000)
        check("Session appears in the saved-roadmaps history as ready", True)
        page.get_by_role("button", name="Build standout projects").first.click()
        expect(page.get_by_role("heading", name="Your roadmap")).to_be_visible(timeout=15_000)
        expect(page.locator("input[type=checkbox]").first).to_be_checked()
        check("Step check-off persisted across reload", True)
        page.screenshot(path="scratchpad/advisor_reopened.png", full_page=True)

        browser.close()

    print()
    if failures:
        print(f"{len(failures)} check(s) FAILED: {failures}")
        sys.exit(1)
    print("All advisor E2E checks passed.")


if __name__ == "__main__":
    main()
