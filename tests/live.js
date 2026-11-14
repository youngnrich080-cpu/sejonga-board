// 6차 #900 시험: 같이 고치기 — 창 둘(A = PC '현재', B = 폰 '세종')이 같은 가짜 서버(DB + Realtime 중계)를 씀
// 실행: SUPABASE_UMD=<supabase.js> [OUT=<사진 폴더>] node tests/live.js
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), UMD = process.env.SUPABASE_UMD, OUT = process.env.OUT;
const EMAIL = { "현재": "guswo1115@hanmail.net", "세종": "sejongahhh@gmail.com" };   // 로그인 계정 → 보드 이름(Devis 와 같은 규칙)
const sessionOf = who => ({ access_token: "fake", refresh_token: "fake", token_type: "bearer", expires_in: 9e6, expires_at: Math.floor(Date.now() / 1000) + 9e6, user: { id: "u-" + who, email: EMAIL[who] } });
let tick = 0; const stamp = () => new Date(Date.UTC(2026, 10, 14, 1, 0, tick++)).toISOString().replace("Z", "+00:00");
const db = { row: { id: "a1", room_id: "room1", title: "눈 점안액 (V로토 프리미엄)", plan: "E · 3편", product: "", author: "현재", body: "-가게-\n첫 줄\n둘째 줄\n셋째 줄\n넷째 줄\n다섯째 줄", must_shots: "", memo: "", stage: 1, stage_log: {}, updated_at: stamp() } };
// 가짜 Realtime: 같은 topic 의 다른 창에 broadcast 를 넘겨 줌(self:false) · block = 아무것도 안 넘김 · drop = 이 말 하나 버림
const rt = { socks: [], block: false, drop: null, sent: [] };
const out = [], ok = (c, l) => { out.push((c ? "통과 " : "실패 ") + l); if (!c) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function openWin(b, who, viewport, mobile) {
  const page = await b.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: OUT ? 2 : 1 });
  page.errors = []; page.on("pageerror", e => page.errors.push(e.message)); page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.__toasts = []; document.addEventListener("DOMContentLoaded", () => new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.classList && n.classList.contains("lvToast") && window.__toasts.push(n.textContent)))).observe(document.body, { childList: true })); });
  await page.route("https://board.test/**", r => r.fulfill({ path: path.join(ROOT, new URL(r.request().url()).pathname.slice(1) || "index.html") }));
  await page.route("https://cdn.jsdelivr.net/**", r => r.request().url().includes("supabase-js") ? r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(UMD) }) : r.abort());
  await page.route("https://ndyygluwlfeqibpdhnjk.supabase.co/rest/**", r => {
    const q = r.request(), u = new URL(q.url()), one = (q.headers().accept || "").includes("pgrst.object");
    if (q.method() === "PATCH") {
      const want = u.searchParams.get("updated_at");
      if (want && want !== "eq." + db.row.updated_at) return r.fulfill({ contentType: "application/json", body: "[]" });
      Object.assign(db.row, q.postDataJSON(), { updated_at: stamp() });
      return r.fulfill({ contentType: "application/json", body: JSON.stringify([db.row]) });
    }
    r.fulfill({ contentType: "application/json", body: JSON.stringify(one ? db.row : [db.row]) });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, ws => {
    const me = { ws, topic: null, join: null, who, page }; page.sock = me;
    rt.socks.push(me);
    ws.onClose(() => { rt.socks = rt.socks.filter(x => x !== me); });
    ws.onMessage(raw => {
      const m = JSON.parse(raw), reply = () => ws.send(JSON.stringify({ topic: m.topic, event: "phx_reply", payload: { status: "ok", response: {} }, ref: m.ref, join_ref: m.join_ref }));
      if (m.event === "phx_join") { me.topic = m.topic; me.join = m.join_ref; return reply(); }
      if (m.event === "broadcast") {
        const p = m.payload.payload; rt.sent.push({ who, ...p });
        if (rt.block) return;
        if (rt.drop && rt.drop(p, who)) { rt.drop = null; return; }
        for (const o of rt.socks) if (o !== me && o.topic === m.topic) o.ws.send(JSON.stringify({ topic: o.topic, event: "broadcast", payload: m.payload, ref: null, join_ref: o.join }));
        return;
      }
      reply();
    });
  });
  await page.addInitScript(s => { localStorage.setItem("sb-ndyygluwlfeqibpdhnjk-auth-token", s); }, JSON.stringify(sessionOf(who)));
  await page.goto("https://board.test/");
  await page.click('.card[data-id="a1"]');
  await page.waitForSelector(".bdSb");
  await page.waitForTimeout(600);
  return page;
}
const body = p => p.$eval("#f_body", x => x.value);
const caretAt = async (p, line, at) => { await p.click(`.bdScView [data-line="${line}"] .bdEd`); await p.evaluate(([l, a]) => { const e = document.querySelector(`.bdScView [data-line="${l}"] .bdEd`), r = document.createRange(); r.setStart(e.firstChild, a); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }, [line, at]); };
const typeEnd = async (p, line, t) => { await p.click(`.bdScView [data-line="${line}"] .bdEd`); await p.keyboard.press("End"); await p.keyboard.type(t); };
const caretInfo = p => p.evaluate(() => { const e = document.activeElement, row = e && e.closest && e.closest("[data-line]"); if (!row) return null; const s = getSelection(), r = s.getRangeAt(0), pre = document.createRange(); pre.selectNodeContents(e); pre.setEnd(r.startContainer, r.startOffset); return { line: +row.dataset.line, at: pre.toString().length, y: scrollY }; });
const lockOf = p => p.evaluate(() => [...document.querySelectorAll(".bdScView .bdLk")].map(r => ({ line: +r.dataset.line, tag: r.querySelector(".bdLkTag")?.textContent, ce: r.querySelector(".bdEd")?.getAttribute("contenteditable") })));
async function label(b, page, f, title) {
  if (!OUT) return;
  const img = (await page.screenshot()).toString("base64"), w = page.viewportSize().width;
  const p2 = await b.newPage({ viewport: { width: w, height: 400 }, deviceScaleFactor: 2 });
  await p2.setContent(`<body style="margin:0;font-family:sans-serif"><div style="font-size:${w < 600 ? 22 : 34}px;font-weight:800;padding:16px 20px;background:#111;color:#fff">${title}</div><img style="width:${w}px;display:block" src="data:image/png;base64,${img}"></body>`);
  await p2.screenshot({ path: path.join(OUT, f + ".png"), fullPage: true }); await p2.close();
}

(async () => {
  const b = await chromium.launch();
  const A = await openWin(b, "현재", { width: 1400, height: 900 }, false);
  const B = await openWin(b, "세종", { width: 390, height: 844 }, true);
  await wait(500);

  // ① A 가 치면 0.5초 안에 B 에 보임 · B 의 커서·스크롤 그대로
  await caretAt(B, 1, 2);                       // B 는 '첫 줄'의 2번째 글자 뒤에 커서
  await B.evaluate(() => scrollTo(0, 120)); const bBefore = await caretInfo(B);
  await typeEnd(A, 3, " 웹에서");
  const t0 = Date.now(); let seen = -1;
  while (Date.now() - t0 < 1500) { if ((await body(B)).includes("셋째 줄 웹에서")) { seen = Date.now() - t0; break; } await wait(25); }
  ok(seen >= 0 && seen <= 500, `A 가 친 글이 B 에 ${seen}ms 만에 보임(0.5초 안)`);
  const bAfter = await caretInfo(B);
  ok(bAfter && bAfter.line === bBefore.line && bAfter.at === bBefore.at && bAfter.y === bBefore.y, "받는 쪽(B) 커서 줄·위치·스크롤 그대로");

  // ② 줄 잠금: A 가 셋째 줄에 있음 → B 에 '현재 쓰는 중' · 못 고침
  await wait(400);
  let lk = await lockOf(B);
  ok(lk.length === 1 && lk[0].line === 3 && lk[0].tag === "현재 쓰는 중" && lk[0].ce === "false", "B 화면: A 가 있는 줄에 테두리 + '현재 쓰는 중' · 그 줄 못 고침");
  await B.$eval('.bdScView [data-line="3"]', e => e.scrollIntoView({ block: "center" }));
  await label(b, B, "live-phone-lock", "폰 390 (세종) · PC에서 현재가 쓰는 줄 = 테두리 + '현재 쓰는 중'");
  const lkA = await lockOf(A);
  ok(lkA.length === 1 && lkA[0].line === 1 && lkA[0].tag === "세종 쓰는 중", "A 화면: B 가 있는 줄(첫 줄)에 '세종 쓰는 중'");
  await A.$eval('.bdScView [data-line="1"]', e => e.scrollIntoView({ block: "center" }));
  await label(b, A, "live-pc-lock", "PC 1400 (현재) · 폰에서 세종이 쓰는 줄 = 테두리 + '세종 쓰는 중'");
  // 잠긴 줄을 B 가 누르고 쳐도 안 바뀜
  const before3 = (await body(B)).split("\n")[3];
  await B.click('.bdScView [data-line="3"] .bdEd', { force: true }).catch(() => {}); await B.keyboard.type("XX");
  ok((await body(B)).split("\n")[3] === before3, "잠긴 줄은 B 가 쳐도 안 바뀜");
  // A 가 줄을 옮기면 풀리고 새 줄이 잠김
  await A.click('.bdScView [data-line="4"] .bdEd'); await wait(500);
  lk = await lockOf(B);
  ok(lk.length === 1 && lk[0].line === 4, "A 가 줄을 옮기면 옛 줄은 풀리고 새 줄이 잠김");

  // ③ 다른 줄을 동시에 → 둘 다 남고 저장도 막대 없이
  await typeEnd(B, 1, " 폰에서");
  await typeEnd(A, 4, " 피씨에서");
  await wait(2600);
  const ba = await body(A), bb = await body(B);
  ok(ba === bb && ba.includes("첫 줄 폰에서") && ba.includes("넷째 줄 피씨에서") && ba.includes("셋째 줄 웹에서"), "다른 줄을 동시에 고치면 두 창 글이 같고 둘 다 남음");
  ok(db.row.body === ba && !(await A.isVisible("#conflict")) && !(await B.isVisible("#conflict")), "자동 저장도 막대 없이(저장된 글 = 두 창 글)");

  // ④ 말 하나를 버림 → want → full 로 맞춰짐
  rt.drop = (p, w) => w === "현재" && p.e === "ed";
  await typeEnd(A, 5, " 하나"); await wait(500);
  ok(!(await body(B)).includes("다섯째 줄 하나"), "(버린 말은 B 에 안 옴)");
  await A.keyboard.type(" 둘"); await wait(900);
  ok(await body(B) === await body(A) && (await body(B)).includes("다섯째 줄 하나 둘"), "다음 말에서 빠진 걸 알고 want → full 로 맞춰짐");
  ok(rt.sent.some(x => x.who === "세종" && x.e === "want" && x.to) && rt.sent.some(x => x.who === "현재" && x.e === "full"), "(B 가 want, A 가 full 을 보냄)");

  // ⑤ 같은 줄을 서로 다르게(서로 못 보는 사이) → 저장 때 막대
  await wait(2000);
  rt.block = true;
  await typeEnd(A, 2, " A꺼"); await wait(1900);
  await B.click('.bdScView [data-line="2"] .bdEd'); await B.keyboard.press("End"); await B.keyboard.type(" B꺼"); await wait(1900);
  ok(await B.isVisible("#conflict") && (await B.$eval("#cMsg", x => x.textContent)).includes("같은 줄") && db.row.body.includes("둘째 줄 A꺼") && !db.row.body.includes("B꺼"), "같은 줄을 서로 다르게 고치면 나중 쪽에 막대 · 먼저 저장한 글 그대로");
  await B.$eval("#conflict", e => e.scrollIntoView({ block: "start" }));
  await label(b, B, "live-phone-conflict", "폰 390 · 같은 줄을 PC와 다르게 고침 → 막대");
  await B.click("#cTake"); rt.block = false; await wait(800);

  // ⑥ 글 보기(textarea): 잠긴 줄에 치기 막음
  await A.click('.bdScView [data-line="4"] .bdEd'); await wait(500);
  await B.click('#vtabs [data-v="txt"]');
  await B.evaluate(() => { const t = document.getElementById("f_body"), L = t.value.split("\n"), p = L.slice(0, 4).join("\n").length + 1 + 2; t.focus(); t.setSelectionRange(p, p); });
  const b4 = (await body(B)).split("\n")[4];
  await B.keyboard.type("Z");
  ok((await body(B)).split("\n")[4] === b4 && await B.isVisible(".lvToast") && (await B.$eval(".lvToast", x => x.textContent)) === "현재가 쓰는 중인 줄이에요", "글 보기에서도 잠긴 줄에 못 침 · '현재가 쓰는 중인 줄이에요'");
  await B.evaluate(() => { const t = document.getElementById("f_body"), L = t.value.split("\n"), p = L.slice(0, 5).join("\n").length + 1; t.setSelectionRange(p, p); });
  await B.keyboard.press("Backspace");
  ok((await body(B)).split("\n")[4] === b4, "잠긴 줄 바로 아래 줄 맨 앞 Backspace 도 막음");
  await B.click('#vtabs [data-v="sb"]');

  // ⑥-1 같은 줄을 거의 동시에 잡음 → 먼저 잡은 A 가 이김 · B 는 칸에서 빠지고 알림
  await B.click("#d_title"); await wait(1200);   // B 는 칸 밖(아무 줄도 안 잡음)
  ok(!(await lockOf(A)).some(x => x.line === 2) && !(await lockOf(B)).some(x => x.line === 2), "(둘째 줄은 아무도 안 잡음)");
  rt.block = true;
  await A.click('.bdScView [data-line="2"] .bdEd'); await wait(300);
  await B.click('.bdScView [data-line="2"] .bdEd'); await wait(200);
  rt.block = false; await wait(2600);              // 2초마다 다시 알리는 lk 로 서로 앎
  const bFocus = await B.evaluate(() => { const r = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-line]"); return r ? +r.dataset.line : null; });
  const bLk = await lockOf(B), aLk = await lockOf(A);
  if (process.env.DBG) console.log("DBG", bFocus, JSON.stringify(bLk), JSON.stringify(aLk), JSON.stringify(rt.sent.filter(x => x.e === "lk").slice(-6).map(x => [x.who, x.line, x.since % 100000])));
  ok(bFocus !== 2 && bLk.some(x => x.line === 2 && x.tag === "현재 쓰는 중") && !aLk.some(x => x.line === 2), "같은 줄 동시에 → 먼저 잡은 A 가 이김, B 는 칸에서 빠짐");
  ok(rt.sent.some(x => x.who === "세종" && x.e === "lk" && x.line === null), "B 는 잠금을 풂(lk line:null)");
  ok((await B.evaluate(() => window.__toasts)).includes("현재가 쓰는 중인 줄이에요"), "B 에 '현재가 쓰는 중인 줄이에요' 알림");
  await A.click('.bdScView [data-line="4"] .bdEd'); await wait(300);

  // ⑧ (8차 #904) A 가 한 줄을 0.45초마다 한 자씩 4초 넘게 치는 동안 B 가 다른 줄을 치고 자동 저장 → A 저장 때 막대 없음
  await A.click('.bdScView [data-line="3"] .bdEd'); await A.keyboard.press("End");
  const typing = (async () => { for (let i = 0; i < 10; i++) { await A.keyboard.type("가나다라마바사아자차"[i]); await wait(450); } })();
  await wait(900);
  await typeEnd(B, 5, " B가씀");
  await typing; await wait(2600);
  const aBody = await body(A);
  ok(!(await A.isVisible("#conflict")) && !(await B.isVisible("#conflict")), "계속 치는 동안 남이 저장해도 막대 없음(거짓 충돌 없음)");
  ok(db.row.body === aBody && aBody.includes("가나다라마바사아자차") && aBody.includes("다섯째 줄 하나 둘 B가씀"), "서버 글 = A 글(다 친 줄 + B 줄)");
  await A.keyboard.type(" 더"); await wait(2200);
  ok(db.row.body.includes("가나다라마바사아자차 더"), "그 뒤 자동 저장 계속");

  // ⑨ (8차) 한글 조합 소식이 끊겨도(compositionend 안 옴) 1.5초 뒤엔 남의 글이 들어옴
  await B.click('.bdScView [data-line="1"] .bdEd');
  await B.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "ㅎ" })));
  await typeEnd(A, 4, " 조합중에옴"); await wait(2600);
  ok((await body(B)).includes("조합중에옴"), "조합이 안 끝난 채로 멈춰도 남의 글이 들어옴(1.5초 뒤)");
  await A.keyboard.type(" 또옴"); await wait(900);
  ok((await body(B)).includes("조합중에옴 또옴"), "그 뒤에도 계속 들어옴");

  // ⑩ (8차) 소켓이 끊겼다 다시 붙으면: '다시 연결 중…' → 붙으면 사라지고 full·want 로 맞춤
  const n0 = rt.sent.length;
  await B.sock.ws.close();
  await wait(300);
  ok(await B.isVisible("#rtState") && (await B.$eval("#rtState", x => x.textContent)) === "다시 연결 중…", "끊기면 '다시 연결 중…'");
  await B.waitForFunction(() => !document.getElementById("rtState") || document.getElementById("rtState").offsetParent === null, null, { timeout: 15000 }).catch(() => {});
  ok(!(await B.isVisible("#rtState")), "다시 붙으면 사라짐");
  ok(rt.sent.slice(n0).some(x => x.who === "세종" && x.e === "full") && rt.sent.slice(n0).some(x => x.who === "세종" && x.e === "want"), "다시 붙으면 내 글 full + want");
  await typeEnd(A, 4, " 다시붙음"); await wait(900);
  ok((await body(B)).includes("다시붙음"), "다시 붙은 뒤 남의 글이 들어옴");

  // ⑦ A 창을 닫으면 5초 안에 풀림
  await A.close(); await wait(6200);
  ok((await lockOf(B)).length === 0, "상대 창을 닫으면 5초 소식 없어서 풀림");
  ok(B.errors.length === 0, "화면 오류 없음 " + B.errors.join(" | "));
  await b.close();
  console.log(out.join("\n"));
})();
