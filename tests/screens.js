// 폰(390x844)·PC(1400x900) 화면 찍기 + 가로 스크롤·글자(13px, TTS·자막 표시 11px)·누르는 곳(44px) 확인.
// Supabase는 page.route로 가짜 답을 준다(실제 데이터 안 건드림).
// 실행: [PRETENDARD_DIR=<pretendard dist/web/variable 경로>] SUPABASE_UMD=<supabase-js@2.45.4 dist/umd/supabase.js 경로> OUT=<사진 폴더> node tests/screens.js
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const OUT = process.env.OUT || path.join(ROOT, "shots");
const UMD = process.env.SUPABASE_UMD;
fs.mkdirSync(OUT, { recursive: true });

const BODY = `[개요]
1. 가게 앞 · 걸어 들어감
2. 메뉴판 · 손으로 짚기
[후킹] 오늘 점심 만 원으로 버티기
-가게 앞-
오늘은 여기서 먹어 볼게요
[가게 간판 · 사진:0a1b2c3d4e5f.jpg]
-메뉴판-
자막: 김치찌개 8,000원
[친구 DM 화면]
친구: 어디야?
나: 밥 먹는 중
-계산-
[쿠팡 · 보온 도시락 · 29,900원]
남은 돈은 2천 원!`;
const THUMB = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135"><rect width="240" height="135" fill="#f4a261"/><circle cx="120" cy="68" r="40" fill="#e76f51"/></svg>').toString("base64");
const now = new Date().toISOString();
const ROWS = [
  { id: "a1", title: "만 원 점심 챌린지", plan: "A 식비 챌린지", product: "보온 도시락", author: "현재", body: BODY, must_shots: "☑ 가게 간판\n☐ 메뉴판 손가락\n☐ 계산대 영수증\n영수증은 꼭 세로로", memo: "", stage: 1, stage_log: { 1: now }, thumb: THUMB, updated_at: now },
  { id: "a2", title: "편의점 3천 원 저녁", plan: "A 식비 챌린지", product: "", author: "세종", body: "-편의점-\n삼각김밥 하나", must_shots: "", memo: "", stage: 0, stage_log: {}, updated_at: now },
  { id: "a3", title: "자취방 냉장고 털기", plan: "B 자취", product: "https://www.coupang.com/vp/products/7972192564?itemId=22086212956&vendorItemId=89133250739&pickType=COU_PICK&q=%EB%B8%8C%EB%9E%9C%EB%93%9C&searchId=95b677c533083978&sourceType=search&rank=0&itemsCount=36&searchRank=0", author: "현재", body: "", must_shots: "", memo: "", stage: 2, stage_log: { 1: now, 2: now }, updated_at: now },
];
const SESSION = { access_token: "fake", refresh_token: "fake", token_type: "bearer", expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, user: { id: "u1", email: "test@example.com", aud: "authenticated", role: "authenticated" } };

const ROWS0 = JSON.stringify(ROWS);
async function run(name, viewport, mobile) {
  ROWS.splice(0, ROWS.length, ...JSON.parse(ROWS0));   // 크기마다 처음 데이터로
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("https://board.test/**", r => {
    const f = new URL(r.request().url()).pathname.slice(1) || "index.html";
    return r.fulfill({ path: path.join(ROOT, f) });
  });
  await page.route("https://cdn.jsdelivr.net/**", r => {
    const u = r.request().url();
    if (u.includes("supabase-js")) return r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(UMD) });
    // Pretendard: PRETENDARD_DIR(npm pretendard@1.3.9 의 dist/web/variable)이 있으면 그 파일로, 없으면 막음
    const m = u.match(/dist\/web\/variable\/(.+)$/);
    if (m && process.env.PRETENDARD_DIR) {
      let f = path.join(process.env.PRETENDARD_DIR, m[1]);
      if (!fs.existsSync(f)) f = f.replace(".min.css", ".css");  // npm 판에는 .min 이 없음
      return r.fulfill({ path: f });
    }
    return r.abort();
  });
  const patches = [];
  await page.route("https://ndyygluwlfeqibpdhnjk.supabase.co/**", r => {
    const q = r.request();
    if (q.url().includes("/rest/v1/scripts") && q.method() === "PATCH") {  // 저장: 보낸 글을 잡아 두고 고친 줄을 돌려줌
      const patch = q.postDataJSON(); patches.push(patch);
      Object.assign(ROWS[0], patch, { updated_at: new Date().toISOString() });
      return r.fulfill({ contentType: "application/json", body: JSON.stringify((q.headers()["accept"] || "").includes("pgrst.object") ? ROWS[0] : [ROWS[0]]) });
    }
    if (q.url().includes("/rest/v1/scripts")) {   // 한 줄 달라고 하면(.single) 그 줄만, 아니면 목록
      const id = new URL(q.url()).searchParams.get("id");
      if ((q.headers()["accept"] || "").includes("pgrst.object")) return r.fulfill({ contentType: "application/json", body: JSON.stringify(ROWS.find(x => "eq." + x.id === id) || ROWS[0]) });
      return r.fulfill({ contentType: "application/json", body: JSON.stringify(ROWS) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(s => localStorage.setItem("sb-ndyygluwlfeqibpdhnjk-auth-token", s), JSON.stringify(SESSION));
  await page.goto("https://board.test/");
  await page.waitForSelector("#cards .card");
  await page.evaluate(() => document.fonts.ready);

  const check = async label => page.evaluate(([label, mobile]) => {
    const out = { label, hscroll: document.documentElement.scrollWidth > innerWidth, small: [], tiny: [] };
    if (!mobile) return out;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (own && (el.classList.contains("tag") ? fs < 11 : fs < 13)) out.small.push(el.tagName + "." + el.className + ":" + el.textContent.trim().slice(0, 12));
      if (el.matches("button,a,input,select,textarea") && r.height < 44) out.tiny.push(el.tagName + ":" + (el.textContent || el.id).trim().slice(0, 12));
    }
    return out;
  }, [label, mobile]);

  const results = [];
  const full = async (f, label) => { results.push(await check(label)); await page.screenshot({ path: path.join(OUT, `${name}-${f}.png`), fullPage: true }); };
  await full("1-list", "목록");
  await page.click('.card[data-id="a1"]');
  await page.waitForSelector(".bdSb");
  await page.evaluate(() => document.fonts.ready);
  await full("2-storyboard", "스토리보드");
  await page.click('#vtabs [data-v="tts"]');
  await full("3-script", "대본만");
  await page.click('#vtabs [data-v="txt"]');
  await full("4-text", "글");
  const counts = await page.evaluate(() => { setView("sb"); return [...document.querySelectorAll(".bdSb")].map(c => c.querySelectorAll(".bdSbL>*").length + "/" + c.querySelectorAll(".bdSbR>*").length); });
  await page.evaluate(() => document.fonts.ready);

  // --- 스토리보드에서 바로 고치기: 컷 2 TTS 줄 끝에 글 붙이고 Enter 로 새 줄 → 되돌리기·다시 하기 → ＋ 넣기 목록 → 저장
  const before = await page.$eval("#f_body", e => e.value);
  const saveOff = await page.$eval("#saveBtn", b => b.disabled);
  await page.click('.bdScView [data-t="say"][data-line="5"] .bdEd');
  await page.keyboard.press("End");
  await page.keyboard.type(" 진짜로");
  await page.keyboard.press("Enter");
  await page.keyboard.type("새 줄도 써 봄");
  await page.waitForTimeout(100);
  const edited = await page.$eval("#f_body", e => e.value);
  await page.$eval('.bdScView [data-line="5"]', e => e.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: path.join(OUT, `${name}-5-edit.png`) });
  await page.click('[data-undo="-1"]');
  const undone = await page.$eval("#f_body", e => e.value);
  await page.click('[data-undo="1"]');
  const redone = await page.$eval("#f_body", e => e.value);
  await page.$eval(".bdScBar", e => e.scrollIntoView({ block: "start" }));
  await page.click(".bdAddBtn");
  await page.waitForTimeout(100);
  results.push(await check("＋ 넣기 목록"));
  await page.screenshot({ path: path.join(OUT, `${name}-6-addmenu.png`) });
  await page.click(".bdAddBtn");
  const saveOn = await page.$eval("#saveBtn", b => !b.disabled);
  await page.click("#saveBtn");
  await page.waitForFunction(() => document.getElementById("savedMsg").textContent.includes("저장됨"));
  const sent = patches.at(-1) || {};
  console.log(name, "고치기: 처음 저장 단추 꺼짐", saveOff, "· 고친 뒤 켜짐", saveOn,
    "· 대본 원문에 반영", edited.includes("오늘은 여기서 먹어 볼게요 진짜로\n새 줄도 써 봄"),
    "· 되돌리기", undone !== edited, "· 다시 하기", redone === edited,
    "· 저장(PATCH) body 같음", sent.body === edited, "· 바뀐 줄 수", edited.split("\n").length - before.split("\n").length);
  fs.writeFileSync(path.join(OUT, `${name}-saved-body.txt`), sent.body || "");
  const font = await page.evaluate(() => [...document.fonts].some(f => f.family.includes("Pretendard") && f.status === "loaded"));
  console.log(name, "Pretendard 불러옴:", font);
  console.log(name, "컷(왼쪽/화면):", counts.join(" "), "오류:", errors.length ? errors : "없음");
  for (const r of results) console.log(name, r.label, "가로스크롤:", r.hscroll, "13px 미만(표시 11px):", r.small.length ? r.small : 0, "44px 미만:", r.tiny.length ? r.tiny : 0);
  await browser.close();
}
(async () => {
  await run("phone", { width: 390, height: 844 }, true);
  await run("pc", { width: 1400, height: 900 }, false);
})();
