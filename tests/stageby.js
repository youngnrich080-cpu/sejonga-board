// #946 단계 줄에 '누가 체크했나'(stage_by = Supabase 트리거가 적는 로그인 메일) — 이름 붙음 · 모르는 메일 = 앞부분 · 기록 없는 옛 단계 = 시각만.
// 실행: SUPABASE_UMD=<supabase-js@2.45.4 dist/umd/supabase.js 경로> node tests/stageby.js
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const UMD = process.env.SUPABASE_UMD;
const now = new Date().toISOString();
const ROW = { id: "a1", title: "단계 시험", plan: "E", product: "", author: "현재", body: "-가게-\n첫 줄", must_shots: "", memo: "", stage: 3, updated_at: now,
  stage_log: { 1: "2026-11-08T05:00:00Z", 2: "2026-11-16T05:00:00Z", 3: "2026-11-16T06:00:00Z" },
  stage_by: { 2: "sejongahhh@gmail.com", 3: "someone@example.com" } };
const SESSION = { access_token: "fake", refresh_token: "fake", token_type: "bearer", expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, user: { id: "u1", email: "guswo1115@hanmail.net", aud: "authenticated", role: "authenticated" } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("https://board.test/**", r => r.fulfill({ path: path.join(ROOT, new URL(r.request().url()).pathname.slice(1) || "index.html") }));
  await page.route("https://cdn.jsdelivr.net/**", r => r.request().url().includes("supabase-js") ? r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(UMD) }) : r.abort());
  await page.route("https://ndyygluwlfeqibpdhnjk.supabase.co/**", r => {
    const q = r.request();
    if (q.url().includes("/rest/v1/scripts")) return r.fulfill({ contentType: "application/json", body: JSON.stringify((q.headers()["accept"] || "").includes("pgrst.object") ? ROW : [ROW]) });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(s => localStorage.setItem("sb-ndyygluwlfeqibpdhnjk-auth-token", s), JSON.stringify(SESSION));
  await page.goto("https://board.test/");
  await page.waitForSelector("#cards .card");
  await page.click('.card[data-id="a1"]');
  await page.waitForSelector("#steps li");
  const m = await page.$$eval("#steps li .meta", els => els.map(e => e.textContent));
  const ok = m.length === 3 && !m[0].includes("·") && m[1].endsWith("· 세종") && m[2].endsWith("· someone") && !errors.length;
  console.log(ok ? "OK stageby" : "FAIL stageby", JSON.stringify(m), errors.join(" | "));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
