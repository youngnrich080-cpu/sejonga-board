// 8차 §2 시험: 로그인 비밀번호 보기 단추(눈 모양 · 44px · aria-label 바뀜)
// 실행: SUPABASE_UMD=<supabase.js> [OUT=<사진 폴더>] node tests/login.js
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), UMD = process.env.SUPABASE_UMD, OUT = process.env.OUT;
(async () => {
  const out = [], ok = (c, l) => { out.push((c ? "통과 " : "실패 ") + l); if (!c) process.exitCode = 1; };
  const b = await chromium.launch();
  for (const [name, vp, mobile] of [["phone", { width: 390, height: 844 }, true], ["pc", { width: 1400, height: 900 }, false]]) {
    const page = await b.newPage({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: OUT ? 2 : 1 });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("https://board.test/**", r => r.fulfill({ path: path.join(ROOT, new URL(r.request().url()).pathname.slice(1) || "index.html") }));
    await page.route("https://cdn.jsdelivr.net/**", r => r.request().url().includes("supabase-js") ? r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(UMD) }) : r.abort());
    await page.route("https://ndyygluwlfeqibpdhnjk.supabase.co/**", r => r.fulfill({ contentType: "application/json", body: "{}" }));
    await page.goto("https://board.test/");
    await page.waitForSelector("#login:not(.hide)");
    await page.fill("#pw", "abc123");
    const box = await page.$eval("#pwEye", e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    ok(box.w >= 44 && box.h >= 44, `${name}: 눈 단추 누르는 자리 ${box.w}×${box.h}`);
    ok(await page.$eval("#pw", e => e.type) === "password" && await page.$eval("#pwEye", e => e.getAttribute("aria-label")) === "비밀번호 보기", `${name}: 처음엔 숨김 · '비밀번호 보기'`);
    await page.click("#pwEye");
    ok(await page.$eval("#pw", e => e.type) === "text" && await page.$eval("#pwEye", e => e.getAttribute("aria-label")) === "비밀번호 숨기기", `${name}: 누르면 보임 · '비밀번호 숨기기'`);
    if (OUT && mobile) {
      const img = (await page.screenshot()).toString("base64");
      const p2 = await b.newPage({ viewport: { width: 390, height: 400 }, deviceScaleFactor: 2 });
      await p2.setContent(`<body style="margin:0;font-family:sans-serif"><div style="font-size:22px;font-weight:800;padding:16px 20px;background:#111;color:#fff">폰 390 · 비밀번호 보기 단추(누른 뒤)</div><img style="width:390px;display:block" src="data:image/png;base64,${img}"></body>`);
      await p2.screenshot({ path: path.join(OUT, "login-eye.png"), fullPage: true }); await p2.close();
    }
    await page.click("#pwEye");
    ok(await page.$eval("#pw", e => e.type) === "password", `${name}: 다시 누르면 숨김`);
    ok(errors.length === 0, `${name}: 화면 오류 없음 ` + errors.join(" | "));
    await page.close();
  }
  await b.close();
  console.log(out.join("\n"));
})();
