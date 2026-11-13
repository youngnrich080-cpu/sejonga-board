// 스토리보드 읽기 규칙 시험: node --test tests/storyboard.test.js
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const code = html.slice(html.indexOf("// ==SB-PARSER=="), html.indexOf("// ==/SB-PARSER=="));
const { sbParse, sbScript } = new Function(code + "; return {sbParse, sbScript};")();

const SAMPLE = `[개요]
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

const shape = r => r.cuts.map(c => [c.name, c.left.length, c.right.length]);

test("예시 body: 개요 1묶음, 컷 수와 컷마다 줄 수", () => {
  const r = sbParse(SAMPLE);
  assert.deepStrictEqual(r.ov, [
    { no: 1, scene: "가게 앞", how: "걸어 들어감" },
    { no: 2, scene: "메뉴판", how: "손으로 짚기" },
  ]);
  // 후킹 줄이 첫 장면 전환 앞에 있으므로 컷 1로 남는다
  assert.deepStrictEqual(shape(r), [
    [null, 1, 0],      // 1: [후킹]
    ["가게 앞", 1, 1], // 2: 나레이션 / 화면: 간판(사진)
    ["메뉴판", 2, 0],  // 3: 자막, DM(말풍선 2)
    ["계산", 2, 0],    // 4: 쇼핑, 나레이션
  ]);
  const [c1, c2, c3, c4] = r.cuts;
  assert.deepStrictEqual(c1.left[0], { type: "narr", hook: true, text: "오늘 점심 만 원으로 버티기" });
  assert.strictEqual(c2.right[0].photo, "0a1b2c3d4e5f.jpg");
  assert.deepStrictEqual(c2.right[0].parts, ["가게 간판"]);
  assert.strictEqual(c3.left[0].type, "cap");
  assert.deepStrictEqual(c3.left[1].msgs.map(m => [m.who, m.me, m.text]), [["친구", false, "어디야?"], ["나", true, "밥 먹는 중"]]);
  assert.deepStrictEqual([c4.left[0].name, c4.left[0].price], ["보온 도시락", "29,900원"]);
});

test("첫 장면 전환 앞에 줄이 없으면 빈 컷 1을 안 그린다, 빈 줄이면 남긴다", () => {
  assert.deepStrictEqual(shape(sbParse("-a-\n가")), [["a", 1, 0]]);
  assert.deepStrictEqual(shape(sbParse("[개요]\n1. x · y\n-a-\n가")), [["a", 1, 0]]);
  assert.deepStrictEqual(shape(sbParse("\n-a-\n가")), [[null, 1, 0], ["a", 1, 0]]);
});

test("DM: 이름이 자막이면 멈춤, 세종=내 말, 사진 자리", () => {
  const r = sbParse("[카톡 · 엄마]\n엄마: 밥은?\n세종: 사진:abcdef123456.jpg\n엄마: [사진]\n자막: 끝");
  const dm = r.cuts[0].left[0];
  assert.strictEqual(dm.type, "dm");
  assert.deepStrictEqual(dm.parts, ["카톡", "엄마"]);
  assert.deepStrictEqual(dm.msgs.map(m => [m.who, m.me, m.photo]), [["엄마", false, null], ["세종", true, "abcdef123456.jpg"], ["엄마", false, ""]]);
  assert.strictEqual(r.cuts[0].left[1].type, "cap");
  assert.strictEqual(r.cuts[0].left.length, 2);
});

test("쇼핑 메모, 댓글, 빈 장면 메모, 전각 콜론 자막", () => {
  const r = sbParse("[스토어 · 12,000원 · 텀블러] 링크 걸기\n[댓글 · @밥순이 · 이거 어디예요]\n[ ]\n자막：안녕");
  const L = r.cuts[0].left, R = r.cuts[0].right;
  assert.deepStrictEqual([L[0].name, L[0].price, L[0].note], ["텀블러", "12,000원", "링크 걸기"]);
  assert.deepStrictEqual([L[1].type, L[1].nick, L[1].text], ["cmt", "@밥순이", "이거 어디예요"]);
  assert.deepStrictEqual(R, [{ type: "scene", parts: [], photo: null, note: "" }]);
  assert.deepStrictEqual(L[2], { type: "cap", text: "안녕" });
});

test("대본만: 나레이션·후킹만, 컷 번호 그대로", () => {
  const s = sbScript(SAMPLE).filter(c => c.lines.length);
  assert.deepStrictEqual(s.map(c => [c.no, c.lines.map(l => l.text)]), [
    [1, ["오늘 점심 만 원으로 버티기"]],
    [2, ["오늘은 여기서 먹어 볼게요"]],
    [4, ["남은 돈은 2천 원!"]],
  ]);
});

test("꼭 찍어야 할 장면: ☑ 체크됨, ☐ 빈 칸, 나머지 글", () => {
  const { mustParse } = new Function(code + "; return {mustParse};")();
  assert.deepStrictEqual(mustParse("☑ 가게 간판\r\n☐ 메뉴판 손가락\n\n그냥 메모\n☑없이붙음"), [
    { box: true, on: true, text: "가게 간판" },
    { box: true, on: false, text: "메뉴판 손가락" },
    { box: false, on: false, text: "그냥 메모" },
    { box: false, on: false, text: "☑없이붙음" },
  ]);
});
