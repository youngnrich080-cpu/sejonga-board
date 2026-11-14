// 5차 §3 시험: 누가 보는 중 · 고치는 중 — 가짜 Realtime(routeWebSocket)으로 다른 사람(세종 폰)을 넣고 빼 봄
// 실행: SUPABASE_UMD=<supabase.js> [OUT=<사진 폴더>] node tests/presence.js
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), UMD = process.env.SUPABASE_UMD, OUT = process.env.OUT;
const SESSION = { access_token: "fake", refresh_token: "fake", token_type: "bearer", expires_in: 9e6, expires_at: Math.floor(Date.now() / 1000) + 9e6, user: { id: "u1", email: "t@example.com" } };
const ROWS = [
  { id: "a1", room_id: "room1", title: "눈 점안액 (V로토 프리미엄)", plan: "E · 3편", product: "", author: "현재", body: "-가게-\n첫 줄\n둘째 줄", must_shots: "", memo: "", stage: 1, stage_log: {}, updated_at: "2026-11-14T00:00:00+00:00" },
  { id: "a2", room_id: "room1", title: "겨울철 다가올 때 가습기", plan: "E · 4편", product: "", author: "현재", body: "줄", must_shots: "", memo: "", stage: 1, stage_log: {}, updated_at: "2026-11-14T00:00:00+00:00" },
];

async function run(name, viewport, mobile) {
  const out = [], ok = (c, l) => { out.push((c ? "통과 " : "실패 ") + l); if (!c) process.exitCode = 1; };
  const b = await chromium.launch();
  const page = await b.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: OUT ? 2 : 1 });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("https://board.test/**", r => r.fulfill({ path: path.join(ROOT, new URL(r.request().url()).pathname.slice(1) || "index.html") }));
  await page.route("https://cdn.jsdelivr.net/**", r => r.request().url().includes("supabase-js") ? r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(UMD) }) : r.abort());
  await page.route("https://ndyygluwlfeqibpdhnjk.supabase.co/rest/**", r => {
    if (r.request().method() === "PATCH") {   // 자동 저장: 고친 줄 돌려줌
      const id = new URL(r.request().url()).searchParams.get("id"), row = ROWS.find(x => "eq." + x.id === id);
      Object.assign(row, r.request().postDataJSON(), { updated_at: new Date().toISOString() });
      return r.fulfill({ contentType: "application/json", body: JSON.stringify([row]) });
    }
    const one = (r.request().headers().accept || "").includes("pgrst.object"), id = new URL(r.request().url()).searchParams.get("id");
    r.fulfill({ contentType: "application/json", body: JSON.stringify(one ? ROWS.find(x => "eq." + x.id === id) : ROWS) });
  });
  // 가짜 Realtime: 채널 하나 · 사람(key)마다 meta 하나
  const rt = { ws: null, topic: null, join: null, joinCfg: null, tracks: [], metas: {}, ref: 0 };
  const push = (event, payload) => rt.ws && rt.ws.send(JSON.stringify({ topic: rt.topic, event, payload, ref: null, join_ref: rt.join }));
  const put = (key, state) => { const old = rt.metas[key]; const m = { phx_ref: "r" + (++rt.ref), ...state }; rt.metas[key] = m; push("presence_diff", { joins: { [key]: { metas: [m] } }, leaves: old ? { [key]: { metas: [old] } } : {} }); };
  const drop = key => { const old = rt.metas[key]; delete rt.metas[key]; if (old) push("presence_diff", { joins: {}, leaves: { [key]: { metas: [old] } } }); };
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, ws => {
    rt.ws = ws;
    ws.onMessage(raw => {
      const m = JSON.parse(raw);
      const reply = () => ws.send(JSON.stringify({ topic: m.topic, event: "phx_reply", payload: { status: "ok", response: {} }, ref: m.ref, join_ref: m.join_ref }));
      if (m.event === "phx_join") { rt.topic = m.topic; rt.join = m.join_ref; rt.joinCfg = m.payload.config; reply(); push("presence_state", Object.fromEntries(Object.entries(rt.metas).map(([k, v]) => [k, { metas: [v] }]))); return; }
      if (m.event === "presence" && m.payload.event === "track") { rt.tracks.push({ t: Date.now(), ...m.payload.payload }); reply(); put(rt.joinCfg.presence.key, m.payload.payload); return; }
      if (m.event === "presence" && m.payload.event === "untrack") { reply(); drop(rt.joinCfg.presence.key); return; }
      reply();
    });
  });
  await page.addInitScript(s => { localStorage.setItem("sb-ndyygluwlfeqibpdhnjk-auth-token", s); }, JSON.stringify(SESSION));
  const label = async (f, title) => {
    if (!OUT) return;
    const img = (await page.screenshot()).toString("base64"), w = viewport.width;
    const p2 = await b.newPage({ viewport: { width: w, height: 400 }, deviceScaleFactor: 2 });
    await p2.setContent(`<body style="margin:0;font-family:sans-serif"><div style="font-size:${w < 600 ? 22 : 34}px;font-weight:800;padding:16px 20px;background:#111;color:#fff">${title}</div><img style="width:${w}px;display:block" src="data:image/png;base64,${img}"></body>`);
    await p2.screenshot({ path: path.join(OUT, f + ".png"), fullPage: true }); await p2.close();
  };

  await page.goto("https://board.test/");
  await page.waitForSelector(".card");
  await page.waitForTimeout(500);
  ok(!rt.topic, "이름을 안 골랐으면 연결 안 함");
  await page.click('#mePick [data-me="현재"]');
  await page.waitForTimeout(800);
  ok(rt.topic === "realtime:board:room1" && rt.joinCfg.private === true && !!rt.joinCfg.presence.key, "고르면 board:<방 id> 비공개 채널에 붙음");
  const t0 = rt.tracks[0] || {};
  ok(t0.who === "현재" && t0.dev === (mobile ? "폰" : "웹") && t0.sid === null && t0.typing === false && typeof t0.at === "number", `내 상태 {who:현재, dev:${mobile ? "폰" : "웹"}, sid:null, typing:false, at}`);

  // 세종이 폰으로 a1 을 봄
  put("sj-phone", { who: "세종", dev: "폰", sid: "a1", typing: false, at: Date.now() });
  await page.waitForTimeout(300);
  ok(await page.$eval('[data-pv="a1"]', e => e.textContent) === "세" && await page.$eval('[data-pv="a1"] i', e => e.title) === "세종 · 폰에서 보는 중", "목록 카드에 '세' 동그라미 · 마우스 올리면 '세종 · 폰에서 보는 중'");
  ok(await page.$eval('[data-pv="a2"]', e => e.textContent) === "", "안 보는 대본엔 없음");
  put("sj-web", { who: "세종", dev: "웹", sid: "a1", typing: false, at: Date.now() });
  await page.waitForTimeout(300);
  ok(await page.$$eval('[data-pv="a1"] i', x => x.length) === 1 && await page.$eval('[data-pv="a1"] i', e => e.title) === "세종 · 폰·웹에서 보는 중", "같은 사람 폰+웹은 동그라미 하나(폰·웹)");
  drop("sj-web");
  for (const [k, w] of [["p1", "가나"], ["p2", "다라"], ["p3", "마바"]]) put(k, { who: w, dev: "웹", sid: "a2", typing: false, at: Date.now() });
  put("p4", { who: "사아", dev: "웹", sid: "a2", typing: false, at: Date.now() });
  await page.waitForTimeout(300);
  ok(await page.$eval('[data-pv="a2"]', e => e.textContent) === "가다마+1", "최대 3개 + '+N'");
  for (const k of ["p1", "p2", "p3", "p4"]) drop(k);
  await page.waitForTimeout(200);
  await label(`${name}-pv-list`, `${mobile ? "폰 390" : "PC 1400"} · 목록 카드에 '세종 보는 중' 동그라미`);

  // 내가 a1 을 엶 → sid 보냄(2초에 한 번까지) · 제목 줄에 '세종 보는 중'
  const n0 = rt.tracks.length;
  await page.click('.card[data-id="a1"]');
  await page.waitForSelector(".bdSb");
  await page.waitForTimeout(2300);
  ok(rt.tracks.slice(n0).some(t => t.sid === "a1"), "대본을 열면 sid 를 보냄");
  ok(await page.$eval("#pvBar", e => e.textContent) === "세종 보는 중", "열린 대본 제목 줄 오른쪽 '세종 보는 중'");
  put("sj-phone", { who: "세종", dev: "폰", sid: "a1", typing: true, at: Date.now() });
  await page.waitForTimeout(300);
  ok(await page.$eval("#pvBar", e => e.textContent) === "세종 고치는 중..." && await page.$$eval("#pvBar .dots i", x => x.length) === 3, "'세종 고치는 중…'(점 셋 움직임)");
  await label(`${name}-pv-typing`, `${mobile ? "폰 390" : "PC 1400"} · 열린 대본 '세종 고치는 중…'`);
  await page.waitForTimeout(10300);   // 8초 + 다시 그리기(2초마다)
  ok(await page.$eval("#pvBar", e => e.textContent) === "세종 보는 중", "8초 동안 새 소식 없으면 '고치는 중' 꺼짐");

  // 내가 침: 처음 한 번 typing:true → 멈추고 3초 뒤 typing:false
  const n1 = rt.tracks.length;
  await page.click('.bdScView [data-line="2"] .bdEd'); await page.keyboard.press("End"); await page.keyboard.type(" 가나다");
  await page.waitForTimeout(2600);
  const tOn = rt.tracks.slice(n1).find(t => t.typing);
  ok(!!tOn, "치면 typing:true 를 보냄");
  await page.waitForTimeout(3500);
  ok(rt.tracks.at(-1).typing === false, "멈추고 3초 뒤 typing:false");
  const gaps = rt.tracks.slice(n0).map((t, i, a) => i ? t.t - a[i - 1].t : 9999);
  ok(gaps.every(g => g >= 1900), "보내기는 2초에 한 번까지");

  // 세종이 나감 → 사라짐
  drop("sj-phone");
  await page.waitForTimeout(300);
  ok(await page.$eval("#pvBar", e => e.textContent) === "", "나가면 사라짐(혼자면 아무것도 안 보임)");

  // 창이 숨겨지면 바로 sid:null
  const n2 = rt.tracks.length;
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(300);
  ok(rt.tracks.slice(n2).some(t => t.sid === null), "창을 숨기면 바로 sid:null");
  ok(errors.length === 0, "화면 오류 없음 " + errors.join(" | "));
  await b.close();
  console.log(out.map(x => name + " " + x).join("\n"));
}
(async () => { await run("phone", { width: 390, height: 844 }, true); await run("pc", { width: 1400, height: 900 }, false); })();
