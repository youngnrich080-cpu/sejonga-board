// 스토리보드 읽기 규칙 시험(Devis 파일 devis-storyboard.js 로): node --test tests/storyboard.test.js
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), path = require("path");
const DevisSB = new Function(fs.readFileSync(path.join(__dirname, "..", "devis-storyboard.js"), "utf8") + "; return DevisSB;")();
const cuts = body => DevisSB.split(DevisSB.parse(body));

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

// 컷마다 [전환 이름, 왼쪽 줄 수, 화면(장면 메모) 수]
const shape = body => cuts(body).gs.map(g => [g.cut ? g.cut.text : null, g.items.filter(b => b.t !== "dir").length, g.items.filter(b => b.t === "dir").length]);

test("예시 body: 개요 1묶음, 컷 4개(첫 전환 앞 [후킹] = 컷 1), 컷마다 줄 수", () => {
  const { pre } = cuts(SAMPLE);
  assert.strictEqual(pre.length, 1);
  assert.deepStrictEqual(pre[0].beats, [{ text: "가게 앞", how: "걸어 들어감" }, { text: "메뉴판", how: "손으로 짚기" }]);
  assert.deepStrictEqual(shape(SAMPLE), [[null, 1, 0], ["가게 앞", 1, 1], ["메뉴판", 2, 0], ["계산", 2, 0]]);
  const g = cuts(SAMPLE).gs;
  assert.strictEqual(g[1].items.find(b => b.t === "dir").img, "0a1b2c3d4e5f.jpg");
  assert.deepStrictEqual(g[2].items[1].msgs.map(m => m.who), ["친구", "나"]);
  assert.deepStrictEqual([g[3].items[0].name, g[3].items[0].price], ["보온 도시락", "29,900원"]);
});

test("첫 장면 전환 앞에 줄이 없으면 빈 컷 1을 안 그린다, 빈 줄이면 남긴다", () => {
  assert.deepStrictEqual(shape("-a-\n가"), [["a", 1, 0]]);
  assert.deepStrictEqual(shape("[개요]\n1. x · y\n-a-\n가"), [["a", 1, 0]]);
  assert.deepStrictEqual(shape("\n-a-\n가"), [[null, 1, 0], ["a", 1, 0]]);
});

test("대본만: 나레이션·후킹만, 컷 3은 TTS 줄 없음", () => {
  assert.deepStrictEqual(DevisSB.ttsLines(SAMPLE), [["오늘 점심 만 원으로 버티기"], ["오늘은 여기서 먹어 볼게요"], [], ["남은 돈은 2천 원!"]]);
});

test("꼭 찍을 장면: ☑ 끝냄, ☐ 안 끝냄", () => {
  assert.deepStrictEqual(DevisSB.mustItems(["☑ 가게 간판", "☐ 메뉴판 손가락", ""]), [{ text: "가게 간판", done: true }, { text: "메뉴판 손가락", done: false }]);
});
