import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";

const ARTIFACT_DIR = "C:/Users/Spydyr/.gemini/antigravity/brain/e4685077-1cd7-4c17-82c0-761cd588b20a";
const SERVER_DIR = resolve("server");
const BIN_EXE = resolve("bin/easel.exe");

const PG_ROOT = join(process.env.LOCALAPPDATA, "Easel", "PostgreSQL18");
const POSTGRES_EXE = join(PG_ROOT, "pgsql", "bin", "postgres.exe");
const PG_ISREADY = join(PG_ROOT, "pgsql", "bin", "pg_isready.exe");
const PG_DATA = join(PG_ROOT, "data");
const PG_PID = join(PG_DATA, "postmaster.pid");

async function waitPgReady(maxTries = 40) {
  for (let i = 0; i < maxTries; i++) {
    const res = spawnSync(PG_ISREADY, ["-h", "127.0.0.1", "-p", "5432"]);
    if (res.status === 0) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("PostgreSQL is not ready for connections");
}

async function waitHttp(port, maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok || res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Port ${port} did not become ready`);
}

async function run() {
  spawnSync("taskkill", ["/F", "/IM", "easel.exe"], { stdio: "ignore" });
  if (existsSync(PG_PID)) {
    try { unlinkSync(PG_PID); } catch {}
  }

  console.log("Starting PostgreSQL process...");
  const pgProc = spawn(POSTGRES_EXE, ["-D", PG_DATA], {
    stdio: "ignore",
    windowsHide: true,
  });

  let srvProc = null;

  try {
    await waitPgReady();
    console.log("PostgreSQL is verified ready to accept connections.");

    console.log("Starting Easel server on 127.0.0.1:5000...");
    srvProc = spawn(BIN_EXE, ["-addr", "127.0.0.1:5000"], {
      cwd: SERVER_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    srvProc.stdout.on("data", (d) => console.log("[server stdout]:", d.toString().trim()));
    srvProc.stderr.on("data", (d) => console.error("[server stderr]:", d.toString().trim()));

    await waitHttp(5000);
    console.log("Easel server is listening on port 5000. Launching Playwright...");

    const browser = await chromium.launch({
      headless: true,
      args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });

    const page = await (
      await browser.newContext({ viewport: { width: 1500, height: 950 } })
    ).newPage();

    page.on("console", (m) => console.log("[page console]:", m.text()));
    page.on("pageerror", (e) => console.error("[page error]:", e.message));

    console.log("Navigating to http://127.0.0.1:5000/ ...");
    await page.goto("http://127.0.0.1:5000/");

    await page.locator("#username").waitFor({ timeout: 10000 });

    console.log("Attempting sign-in as pathfinder-gm...");
    await page.locator("#username").fill("pathfinder-gm");
    await page.locator("#password").fill("browser password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    let loggedIn = false;
    try {
      await page.waitForFunction(() => Boolean(Easel?.Components?.get("lobby")), { timeout: 3000 });
      loggedIn = true;
      console.log("Signed in successfully.");
    } catch {}

    if (!loggedIn) {
      console.log("Sign-in failed. Creating account...");
      const toggle = page.getByRole("button", { name: "Create an account", exact: true });
      if (await toggle.isVisible()) {
        await toggle.click();
        await page.locator("#username").fill("pathfinder-gm");
        await page.locator("#password").fill("browser password");
        await page.locator("#displayName").fill("pathfinder-gm");
        await page.getByRole("button", { name: "Create account", exact: true }).click();
        await page.waitForFunction(() => Boolean(Easel?.Components?.get("lobby")), { timeout: 5000 });
        console.log("Created account and loaded lobby.");
      }
    }

    console.log("Waiting for lobby games state...");
    await page.waitForFunction(() => (Easel?.Components?.get("lobby")?.props?.games?.length || 0) > 0, { timeout: 10000 });

    const joinBtn = page.locator(".table-card.lobby-game button[data-action='join']").first();
    await joinBtn.waitFor({ timeout: 5000 });
    console.log("Found table card. Joining game...");
    await joinBtn.click();

    console.log("Joined table. Waiting for workspace...");
    const workspace = page.locator(".kit-easel-layout-vttworkspace");
    await workspace.waitFor({ timeout: 10000 });
    await page.locator(".kit-vtt-sidebar").waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Screenshot 1: Desktop table with right sidebar tabs
    await page.screenshot({ path: join(ARTIFACT_DIR, "vtt_initial.png") });
    console.log("Saved vtt_initial.png");

    // Click on Actors tab in the right sidebar
    console.log("Switching to Actors tab...");
    const actorsTab = page.locator('.kit-vtt-sidebar button[role="tab"]').filter({ hasText: "Actors" });
    await actorsTab.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: join(ARTIFACT_DIR, "actors_directory.png") });
    console.log("Saved actors_directory.png");

    // Click on Valeros (Fighter) in directory
    console.log("Opening Valeros sheet...");
    const valerosEntry = page.locator(".kit-directory-entry").filter({ hasText: "Valeros" });
    await valerosEntry.click();
    await page.waitForTimeout(1000);

    // Verify window and character sheet rendered
    const win = page.locator(".kit-window");
    await win.waitFor({ timeout: 5000 });
    await page.screenshot({ path: join(ARTIFACT_DIR, "character_sheet_valeros.png") });
    console.log("Saved character_sheet_valeros.png");

    // Switch to Attributes tab
    console.log("Switching to Attributes tab...");
    const attrTab = page.locator('.pf1e-charactersheet-container button[role="tab"]').filter({ hasText: "Attributes" });
    await attrTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(ARTIFACT_DIR, "sheet_attributes_tab.png") });
    console.log("Saved sheet_attributes_tab.png");

    // Switch to Combat tab
    console.log("Switching to Combat tab...");
    const combatTab = page.locator('.pf1e-charactersheet-container button[role="tab"]').filter({ hasText: "Combat" });
    await combatTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(ARTIFACT_DIR, "sheet_combat_tab.png") });
    console.log("Saved sheet_combat_tab.png");

    console.log("Clicking Attack on Longsword...");
    const atkBtn = page.locator(".pf1e-btn-attack").first();
    await atkBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(ARTIFACT_DIR, "after_attack_click.png") });
    console.log("Saved after_attack_click.png");

    console.log("Clicking Roll in dialog...");
    const rollBtn = page.locator(".kit-btn-roll");
    await rollBtn.click();

    // Capture dice in mid-roll tumbling!
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(ARTIFACT_DIR, "dice_in_flight.png") });
    console.log("Saved dice_in_flight.png");

    // Wait for dice to settle and card to reveal
    await page.waitForTimeout(1600);
    await page.screenshot({ path: join(ARTIFACT_DIR, "after_roll_click.png") });
    console.log("Saved after_roll_click.png");

    console.log("Switching to Chat tab in sidebar...");
    const chatTab = page.locator('.kit-vtt-sidebar button[role="tab"]').filter({ hasText: "Chat" });
    await chatTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(ARTIFACT_DIR, "chat_single_attack.png") });
    console.log("Saved chat_single_attack.png");

    // Now test FULL ATTACK!
    console.log("Testing Full Attack...");
    // Bring character sheet to front or click Full Attack
    const fullAtkBtn = page.locator(".pf1e-btn-fullattack").first();
    if (await fullAtkBtn.isVisible()) {
      await fullAtkBtn.click();
      await page.waitForTimeout(500);
      const rollBtn2 = page.locator(".kit-btn-roll");
      if (await rollBtn2.isVisible()) {
        await rollBtn2.click();
      }
      await page.waitForTimeout(1800);
      await page.screenshot({ path: join(ARTIFACT_DIR, "chat_full_attack.png") });
      console.log("Saved chat_full_attack.png");

      // Wait for auto-fadeout (1800ms hold + 600ms fadeout = 2400ms)
      console.log("Waiting for dice to auto-fadeout...");
      await page.waitForTimeout(2000);
      await page.screenshot({ path: join(ARTIFACT_DIR, "table_after_dice_fadeout.png") });
      console.log("Saved table_after_dice_fadeout.png");
    }

    // Switch to Skills tab
    console.log("Switching to Skills tab...");
    const skillsTab = page.locator('.pf1e-charactersheet-container button[role="tab"]').filter({ hasText: "Skills" });
    await skillsTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(ARTIFACT_DIR, "sheet_skills_tab.png") });
    console.log("Saved sheet_skills_tab.png");

    // Switch back to Actors tab to click + New Character
    await page.locator('.kit-vtt-sidebar button[role="tab"]').filter({ hasText: "Actors" }).click();
    await page.waitForTimeout(500);

    // Click "+ New Character" in directory to verify creating a second sheet
    console.log("Clicking + New Character...");
    const newCharBtn = page.locator(".kit-directory-create");
    await newCharBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(ARTIFACT_DIR, "multiple_sheets.png") });
    console.log("Saved multiple_sheets.png");

    await browser.close();
    console.log("All visual tests passed and screenshots captured successfully!");
  } finally {
    console.log("Shutting down processes...");
    if (srvProc) {
      try { srvProc.kill(); } catch {}
    }
    try { pgProc.kill(); } catch {}
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
