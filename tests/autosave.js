// 5차 §1·§2 시험: 자동 저장 1.5초 · 남이 고친 글 안 덮기(같은 칸 = 막대 / 다른 칸 = 둘 다 남음) · updated_at 조건 다시 하기 · \r\n 거짓 충돌 없음
// 가짜 Supabase(page.route)가 줄 하나를 들고 있고, PATCH 마다 updated_at 을 바꿈(scripts_touch 트리거 흉내)
// 실행: SUPABASE_UMD=<supabase.js> [OUT=<사진 폴더>] node tests/autosave.js
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.join(__dirname, ".."), UMD = process.env.SUPABASE_UMD, OUT = process.env.OUT;
const SESSION = { access_token: "fake", refresh_token: "fake", token_type: "bearer", expires_in: 9e6, expires_at: Math.floor(Date.now() / 1000) + 9e6, user: { id: "u1", email: "t@example.com" } };
let tick = 0; const stamp = () => new Date(Date.UTC(2026, 10, 14, 0, 0, tick++)).toISOString().replace("Z", "+00:00");

async function setup(viewport, mobile, row0) {
  const db = { row: { id: "a1", title: "눈 점안액", plan: "E", product: "", author: "현재", body: "-가게-\r\n첫 줄\r\n둘째 줄", must_shots: "", memo: "", stage: 1, stage_log: {}, updated_at: stamp(), ...row0 }, patches: [], beforePatch: null };
  const b = await chromium.launch();
  const page = await b.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: OUT ? 2 : 1 });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.route("https://board.test/**", r => r.fulfill({ path: path.join(ROOT, new URL(r.request().url()).pathname.slice(1) || "index.html") }));
  await page.route("https://cdn.jsdelivr.net/**", r => r.request().url().includes("supabase-js") ? r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(UMD) }) : r.abort());
  await page.route("https://ndyygluwlfeqibpdhnjk.supabase.co/rest/**", r => {
    const q = r.request(), u = new URL(q.url()), one = (q.headers()["accept"] || "").includes("pgrst.object");
    if (q.method() === "PATCH") {
      const patch = q.postDataJSON(), want = u.searchParams.get("updated_at");
      if (db.beforePatch) { const f = db.beforePatch; db.beforePatch = null; f(db); }   // 그사이 다른 곳이 저장한 것 흉내
      db.patches.push({ patch, want, hit: want === "eq." + db.row.updated_at });
      if (want && want !== "eq." + db.row.updated_at) return r.fulfill({ contentType: "application/json", body: "[]" });
      Object.assign(db.row, patch, { updated_at: stamp() });
      return r.fulfill({ contentType: "application/json", body: JSON.stringify([db.row]) });
    }
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(one ? db.row : [db.row]) });
  });
  await page.route("https://ndyygluwlfeqibpdhnjk.supabase.co/realtime/**", r => r.abort());
  await page.addInitScript(s => localStorage.setItem("sb-ndyygluwlfeqibpdhnjk-auth-token", s), JSON.stringify(SESSION));
  await page.goto("https://board.test/");
  await page.click('.card[data-id="a1"]');
  await page.waitForSelector(".bdSb");
  await page.waitForTimeout(300);
  return { b, page, db, errors };
}
const other = (db, ch) => Object.assign(db.row, ch, { updated_at: stamp() });          // 다른 곳(Devis)이 저장
const typeAt = async (page, line, text) => { await page.click(`.bdScView [data-line="${line}"] .bdEd`); await page.keyboard.press("End"); await page.keyboard.type(text); };
const shot = async (page, name, title) => {
  if (!OUT) return;
  const img = (await page.screenshot()).toString("base64"), w = page.viewportSize().width;   // 위에 큰 글씨 설명을 붙여 따로 찍음(이 뒤로 이 창은 안 씀)
  await page.setContent(`<body style="margin:0;font-family:sans-serif"><div style="font-size:${w < 600 ? 22 : 34}px;font-weight:800;padding:16px 20px;background:#111;color:#fff">${title}</div><img style="width:${w}px;display:block" src="data:image/png;base64,${img}"></body>`);
  await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true });
};

async function run(name, viewport, mobile) {
  const out = [];
  const ok = (cond, label) => { out.push((cond ? "통과 " : "실패 ") + label); if (!cond) process.exitCode = 1; };

  // ① 자동 저장 1.5초 · \r\n 은 거짓 충돌 아님 · 바꾼 칸만 보냄
  let { b, page, db, errors } = await setup(viewport, mobile);
  ok(db.patches.length === 0 && await page.$eval("#saveBtn", x => x.disabled), "열기만 하면 저장 안 함(\\r\\n 본문도 그대로)");
  await typeAt(page, 2, " 고침");
  await page.waitForTimeout(1000);
  ok(db.patches.length === 0, "치고 1초 뒤엔 아직 저장 안 함");
  await page.waitForTimeout(900);
  ok(db.patches.length === 1 && Object.keys(db.patches[0].patch).join() === "body" && db.row.body.includes("둘째 줄 고침"), "멈추고 1.5초 뒤 자동 저장(본문 칸만 보냄)");
  ok(db.patches[0].hit, "PATCH 에 updated_at=eq.<방금 GET 값> 조건");
  ok((await page.$eval("#savedMsg", x => x.textContent)).startsWith("저장됨"), "'저장됨' 표시");

  // ② 다른 곳이 다른 칸(메모·단계)만 고침 → 둘 다 남음
  other(db, { memo: "Devis 메모", stage: 2 });
  await typeAt(page, 2, " 또");
  await page.waitForTimeout(1900);
  ok(db.row.memo === "Devis 메모" && db.row.body.includes("고침 또") && db.row.stage === 2, "다른 칸이면 둘 다 남음(메모·단계 그대로, 내 본문 저장)");
  ok(await page.$eval("#f_memo", x => x.value) === "Devis 메모", "남이 고친 메모가 내 화면에도 조용히 들어옴");
  ok(Object.keys(db.patches.at(-1).patch).join() === "body", "보낸 건 내가 바꾼 본문뿐");

  // ③ GET 과 PATCH 사이에 또 바뀜(updated_at 다름) → 다시 읽고 저장
  const n0 = db.patches.length;
  db.beforePatch = d => other(d, { plan: "F" });
  await typeAt(page, 2, " 셋");
  await page.waitForTimeout(2200);
  ok(db.patches.length === n0 + 2 && !db.patches[n0].hit && db.patches[n0 + 1].hit && db.row.plan === "F" && db.row.body.includes("셋"), "0줄이면 다시 읽고 다시 저장(남의 기획안도 남음)");

  // ④ 다른 곳이 같은 칸(본문)을 고침 → 저장 안 함 · 막대
  other(db, { body: db.row.body.replace("둘째 줄", "둘째 줄 Devis") });
  const devisBody = db.row.body, n1 = db.patches.length;
  await typeAt(page, 2, " 넷");
  await page.waitForTimeout(1900);
  const myBody = await page.$eval("#f_body", x => x.value);
  ok(db.patches.length === n1 && db.row.body === devisBody, "같은 칸이면 저장 안 함(Devis 글 그대로)");
  ok(await page.isVisible("#conflict") && myBody.includes("셋 넷"), "막대가 뜨고 내 글은 화면에 그대로");
  await page.$eval("#conflict", e => e.scrollIntoView({ block: "start" }));
  await shot(page, `${name}-conflict`, `${name === "phone" ? "폰 390" : "PC 1400"} · 같은 칸을 Devis가 고침 → 충돌 막대`);
  await b.close();

  // ④-1 [새 글 보기] → 남의 글 · ↶ 되돌리기로 내 글
  ({ b, page, db, errors } = await setup(viewport, mobile));
  other(db, { body: db.row.body.replace("둘째 줄", "둘째 줄 Devis줄") });   // 내가 고치는 줄과 같은 줄
  await typeAt(page, 2, " 내꺼");
  await page.waitForTimeout(1900);
  ok(await page.isVisible("#conflict"), "막대(새 글 보기 시험)");
  const mine2 = await page.$eval("#f_body", x => x.value);
  await page.click("#cTake");
  ok(!(await page.isVisible("#conflict")) && (await page.$eval("#f_body", x => x.value)).includes("Devis줄") && !(await page.$eval("#f_body", x => x.value)).includes("내꺼"), "[새 글 보기] = 남이 고친 글로 바뀜");
  await page.click('[data-undo="-1"]');
  ok(await page.$eval("#f_body", x => x.value) === mine2, "↶ 되돌리기로 내 글이 돌아옴");
  await b.close();

  // ④-2 [내 글로 덮기]
  ({ b, page, db, errors } = await setup(viewport, mobile));
  other(db, { body: db.row.body.replace("둘째 줄", "둘째 줄 Devis줄") });   // 내가 고치는 줄과 같은 줄
  await typeAt(page, 2, " 내꺼");
  await page.waitForTimeout(1900);
  const mine3 = await page.$eval("#f_body", x => x.value);
  await page.click("#cMine");
  await page.waitForTimeout(500);
  ok(!(await page.isVisible("#conflict")) && db.row.body === mine3, "[내 글로 덮기] = 내 글로 저장");

  ok((await page.$eval("#cMsg", x => x.textContent)).includes("같은 줄"), "막대 글: '같은 줄을 고쳤어요'");
  // ⑤ 창이 다시 보일 때: 안 저장한 고침 없으면 조용히 새 글
  other(db, { body: db.row.body + "\n폰에서 보는 사이 Devis 가 넣음", title: "새 제목" });
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(400);
  ok((await page.$eval("#f_body", x => x.value)).includes("폰에서 보는 사이") && await page.$eval("#d_title", x => x.textContent) === "새 제목" && !(await page.isVisible("#conflict")), "창이 다시 보이면 조용히 새 글로");
  ok(errors.length === 0, "화면 오류 없음 " + errors.join(" | "));
  await b.close();

  // ⑥ (6차) 같은 본문 칸이라도 다른 줄이면 줄 단위로 합쳐 저장 — 막대 없음 · 남의 줄이 내 화면에도
  ({ b, page, db, errors } = await setup(viewport, mobile));
  other(db, { body: db.row.body.replace("첫 줄", "첫 줄 Devis가 고침") });
  await typeAt(page, 2, " 웹이 고침");
  await page.waitForTimeout(2000);
  ok(!(await page.isVisible("#conflict")) && db.row.body.includes("첫 줄 Devis가 고침") && db.row.body.includes("둘째 줄 웹이 고침"), "다른 줄이면 둘 다 남고 막대 없음(줄 단위 합치기)");
  ok((await page.$eval("#f_body", x => x.value)).includes("첫 줄 Devis가 고침"), "합친 글이 내 화면에도");
  ok(errors.length === 0, "화면 오류 없음(합치기) " + errors.join(" | "));
  await b.close();
  console.log(out.map(x => name + " " + x).join("\n"));
}
(async () => { await run("phone", { width: 390, height: 844 }, true); await run("pc", { width: 1400, height: 900 }, false); })();
