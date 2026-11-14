/* devis-storyboard.js — 만든 날짜 2026-11-14 · Devis 커밋 7a9c388 + 아직 커밋 안 한 수정
 * Devis 대본 보드의 스토리보드·대본만 보기·글 보기를 웹 보드에서 똑같이 그리는 파일(보기 전용). build.py 가 만듦 — 손으로 고치지 말 것.
 * 사용: DevisSB.render(el, 대본글, { view: 'sb' | 'tts' | 'text', mustShots }) — 짝 파일 devis-storyboard.css 도 같이 넣기 */
var DevisSB = (function () {
'use strict';
/* ---- web/sbcore.js ---- */
// #889 대본 글 읽기 · 컷 묶기 · 대본만 보기 줄 고르기 — 순수 함수만(화면·서버·전역 상태 없음).
// Devis(app.js)와 웹 보드(tools/webboard/build.py 가 devis-storyboard.js 로 이어 붙임)가 이 파일 하나를 같이 씀 — 고칠 때는 여기서만.
// 글 형식 = 세종아 기획안 웹 대본과 같음: '-장면 전환-' 컷 · '[후킹] 문장' · '자막: 글' · '[장면 메모 · 사진:지문.jpg]' · '[친구 DM 화면]' 다음 줄 '이름: 말' · '[쿠팡 · 상품 · 29,900원]' · '[개요]' + '1. 장면 · 찍는 법'
const BD_ME = /^(세종|나)$/;
const BD_SAY = /^\s*([^\s:：\[\]][^:：\[\]]{0,9})\s*[:：]\s*(.*)$/;
const BD_IMG = /^사진:([0-9a-f]{12}\.jpg)$/;
const BD_OV_BEAT = /^\s*\d+\s*[.)]\s+(.*)$/; // '1. ' (점 뒤 칸) — '1.5배 …' 같은 대본 줄은 안 먹음
function bdOvBeat(s) {
  const t = String(s || '').trim(),
    k = t.lastIndexOf(' · ');
  return k > 0 ? { text: t.slice(0, k).trim(), how: t.slice(k + 3).trim() } : { text: t, how: '' };
}
function bdScParse(text) {
  const L = String(text || '').split('\n'),
    out = [];
  for (let i = 0; i < L.length; i++) {
    const s = L[i],
      hk = s.match(/^\s*\[후킹\] ?(.*)$/), // #499 후킹 줄 = '[후킹] 문장'(세종아 웹에서도 그대로 읽힘) — 문장만 나레이션 줄로
      br = !hk && s.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
    if (hk) {
      out.push({ t: 'say', line: i, text: hk[1], hook: true });
      continue;
    }
    if (br) {
      const inner = br[1].trim(),
        parts = inner.split(/\s*·\s*/).filter(Boolean),
        rest = br[2].trim();
      if (inner === '개요' && !rest) {
        // #439 개요 = '[개요]' 다음 '1. 장면 · 찍는 법' 줄들(세종아 웹에서도 그대로 읽힘)
        const b = { t: 'ov', line: i, end: i, beats: [] };
        while (i + 1 < L.length) {
          const m = L[i + 1].match(BD_OV_BEAT);
          if (!m) break;
          b.beats.push(bdOvBeat(m[1]));
          i++;
        }
        b.end = i;
        out.push(b);
        continue;
      }
      if (/DM|디엠|카톡|문자|메시지/i.test(inner)) {
        const head = parts.find((x) => /DM|디엠|카톡|문자|메시지/i.test(x)) || '',
          imgP = parts.find((x) => BD_IMG.test(x)) || '',
          photo = parts.find((x) => x !== head && x !== imgP && /사진|캡처|영상/.test(x)) || '',
          other =
            parts.find((x) => x !== head && x !== photo && x !== imgP) ||
            head.replace(/\s*(DM|디엠|카톡|문자|메시지)(\s*(화면|창))?.*$/i, '').trim(),
          b = { t: 'dm', line: i, end: i, parts, photo, img: imgP ? imgP.slice(3) : '', who: other, msgs: [] };
        while (i + 1 < L.length) {
          const m = L[i + 1].match(BD_SAY);
          if (!m || /^자막$/.test(m[1].trim())) break;
          const im = m[2].trim().match(BD_IMG);
          b.msgs.push({ who: m[1].trim(), text: m[2], img: im ? im[1] : '', ph: m[2].trim() === '[사진]', line: i + 1 }); // #394 '[사진]' = 아직 빈 사진 자리
          i++;
        }
        b.end = i;
        if (!b.who) b.who = (b.msgs.find((m) => !BD_ME.test(m.who)) || {}).who || '친구';
        out.push(b);
      } else if (/쿠팡|쇼핑|상품|스토어/.test(inner)) {
        const price = parts.find((x) => /^[\d,.]+\s*원$/.test(x)) || '',
          name = parts.slice(1).find((x) => x !== price && !/화면|캡처/.test(x)) || '';
        out.push({ t: 'shop', line: i, shop: (parts[0] || '쿠팡').replace(/\s*(화면|캡처)$/, ''), name, price, note: rest });
      } else if (/댓글/.test(parts[0] || '')) {
        out.push({
          t: 'yt',
          line: i,
          head: parts[0],
          name: parts.find((x) => x.startsWith('@')) || '',
          text:
            rest ||
            parts
              .slice(1)
              .filter((x) => !x.startsWith('@'))
              .join(' · ')
        });
      } else {
        const im = parts.find((x) => BD_IMG.test(x)); // #647 장면 사진 = '[장면 메모 · 사진:지문.jpg]'(세종아 웹엔 글 그대로)
        out.push(
          im
            ? { t: 'dir', line: i, text: parts.filter((x) => x !== im).join(' · ') + (rest ? ' ' + rest : ''), img: im.slice(3) }
            : { t: 'dir', line: i, text: inner + (rest ? ' ' + rest : '') }
        );
      }
      continue;
    }
    if (/^\s*\[\s*\]\s*$/.test(s)) {
      out.push({ t: 'dir', line: i, text: '' }); // 빈 장면 메모(＋ 단추로 막 넣은 것)
      continue;
    }
    const cut = s.match(/^\s*-\s*([^-].*?)\s*-\s*$/);
    if (cut) {
      out.push({ t: 'cut', line: i, text: cut[1] });
      continue;
    }
    const sub = s.match(/^\s*자막\s*[:：]\s*(.*)$/);
    if (sub) {
      out.push({ t: 'sub', line: i, text: sub[1] });
      continue;
    }
    out.push({ t: 'say', line: i, text: s }); // 나레이션·대사(빈 줄도 한 줄 — 그림에서 그대로 쓰는 줄)
  }
  return out;
}
// 컷 묶기(스토리보드 칸 규칙): 개요([개요])는 따로, '-장면 전환-' 줄마다 새 컷 — 컷 1 = 첫 전환 앞 줄들. 글이 장면 전환으로 시작하면(앞에 줄 없음) 그 빈 칸은 안 셈 — #649 빈 줄이라도 있으면 컷 1로 남김
function bdSbSplit(bl) {
  const pre = [],
    gs = [{ cut: null, items: [] }];
  for (const b of bl) {
    if (b.t === 'ov') pre.push(b);
    else if (b.t === 'cut') gs.push({ cut: b, items: [] });
    else gs.at(-1).items.push(b);
  }
  if (!gs[0].items.length && gs.length > 1) gs.shift();
  return { pre, gs };
}
// #692 대본만 보기 = TTS로 읽을 줄만(컷마다 글이 있는 나레이션 줄 — 자막·장면 메모·DM·쇼핑 빼고) · 컷 번호 = 스토리보드 칸 번호
function bdTtsGroups(body) {
  return bdSbSplit(bdScParse(body)).gs.map((g) => g.items.filter((b) => b.t === 'say' && b.text.trim()).map((b) => b.text.trim()));
}

// ---------- #894 고치기 규칙 — 줄 글(L)만 만지는 순수 함수(화면·전역 상태 없음). Devis app.js 와 웹 보드(edit:true)가 같이 씀 ----------
// 줄 자리 글(빈 칸에 흐리게 보이는 글)
const BD_PH = {
  say: '', // #392b 행님: 빈 줄은 읽기 좋게 비워 둔 것 — 안내 글 없이
  msg: '할 말',
  who: '이름',
  sub: '자막',
  cut: '장면 전환',
  dir: '찍을 장면',
  name: '상품 이름',
  price: '가격',
  yname: '@닉네임',
  ytext: '댓글'
};
// ＋ 넣기 목록: [종류, 이름, 넣을 줄들, 커서가 갈 줄(넣은 첫 줄에서 몇 줄 아래)]
const BD_SC_ADD = [
  ['cut', '컷 나누기 (장면 전환)', ['-장면 전환-'], 0], // #670 행님 11/08: 문장 뒤 '/컷' = 다음 줄부터 새 컷 · 줄 앞 '/컷' = 이 줄부터 새 컷
  ['sub', '자막', ['자막: '], 0],
  ['dir', '장면 메모', ['[ ]'], 0],
  ['dm', 'DM 창', ['[DM · 친구]', '친구: ', '세종: '], 1],
  ['shop', '쇼핑 상품', ['[쿠팡]'], 0],
  ['yt', '유튜브 댓글', ['[유튜브 댓글] '], 0],
  ['ov', '개요', ['[개요]'], 0], // #439 맨 위에 하나(누르면 바로 쓰기)
  ['hook', '후킹', [], 0] // #499 이 줄을 후킹(인트로) 한 줄로 — 같은 걸 또 고르면 풀림
];
const BD_HOOK = '[후킹] ';
const BD_ADD_IC = { cut: 'cut', sub: 'text', dir: 'camera', dm: 'chat', shop: 'cart', yt: 'play', ov: 'list', hook: 'hook' }; // #547 선 아이콘 이름
const BD_SLASH = { cut: ['컷', '컷나누기', '나누기', '전환', '장면전환', '장면', 'cut'], sub: ['자막', 'sub'], dir: ['메모', '장면메모', 'memo'], dm: ['dm', '디엠', '카톡', '문자', '메시지'], shop: ['쇼핑', '상품', '쿠팡', 'shop'], yt: ['댓글', '유튜브', 'yt'], ov: ['개요', 'ov'], hook: ['후킹', '인트로', 'hook'] };
// DM 의 내 쪽 이름(me)으로 넣을 줄 만들기 — 우리(세종아 방) '세종' · 누나판·다른 방 '나'
const bdAddLines = (d, me) => d[2].map((x) => (x === '세종: ' ? me + ': ' : x));

// 칸에서 고친 것 → 그 줄 글(그림 → 글). row = 줄 요소(.bdEd 칸과 data-* 를 가진 것)
function bdScLineOf(row, L) {
  const v = (f) => {
    const e = row.querySelector(`:scope > .bdEd[data-f="${f}"], :scope .bdEd[data-f="${f}"]`);
    return e ? e.textContent.replace(/\n/g, ' ') : '';
  };
  const t = row.dataset.t;
  if (t === 'say') return (row.dataset.hook ? BD_HOOK : '') + v('say'); // #499
  if (t === 'cut') return `-${v('cut').trim() || '장면 전환'}-`;
  if (t === 'sub') return `자막: ${v('sub')}`;
  if (t === 'dir') return row.dataset.img ? `[${[v('dir').trim(), '사진:' + row.dataset.img].filter(Boolean).join(' · ')}]` : `[${v('dir').trim() || ' '}]`; // #647 사진 그대로
  if (t === 'shop') {
    const n = v('name').trim(),
      p = v('price').trim(),
      note = row.dataset.note;
    return `[${[row.dataset.shop || '쿠팡', n, p].filter(Boolean).join(' · ')}]${note ? ' ' + note : ''}`;
  }
  if (t === 'yt') {
    const n = v('yname').trim();
    return `[${[row.dataset.head || '유튜브 댓글', n].filter(Boolean).join(' · ')}] ${v('ytext')}`;
  }
  if (t === 'msg') return `${row.dataset.who}: ${v('msg')}`;
  if (t === 'dm') {
    const b = bdScParse(L[+row.dataset.line]).find((x) => x.t === 'dm') || { parts: [], photo: '', img: '' },
      who = v('who').trim() || '친구';
    return `[${who} DM 화면${b.photo ? ' · ' + b.photo : ''}${b.img ? ' · 사진:' + b.img : ''}]`;
  }
  return L[+row.dataset.line] || '';
}
// 줄 가르기('/…'·Alt+Enter 가 쓰는 규칙): 줄 L[sl.line] 에서 sl.at 앞 글 · sl.end 뒤 글을 남기고 가운데를 뺌 → [앞글 줄, 뒷글 줄]
function bdSlashCut(L, sl) {
  const r = L[sl.line] || '',
    sp = (r.match(/^자막\s*:\s*/) || [''])[0], // #682 자막 줄에서도 — 화면 글은 '자막: ' 뺀 글 기준 · 뒷글도 자막
    pre = /^\[후킹\] /.test(r) ? '[후킹] ' : sp, // #499 후킹 줄: 앞글이 후킹 표시를 이어 받음
    t = r.slice(pre.length),
    b = t.slice(0, sl.at).replace(/\s+$/, ''),
    a = t.slice(sl.end).replace(/^\s+/, '');
  return [b ? pre + b : '', a && sp ? sp + a : a];
}
// ＋ 넣기(줄 가르기 방식): sl = {line, at, end} — 앞글 / 카드 / 뒷글 줄로 가름. o = {sb, me}. → { L: 새 줄들, line, at } (없는 종류면 null)
function bdPickRule(L0, k, sl, o) {
  const d = BD_SC_ADD.find((x) => x[0] === k);
  if (!d || k === 'ov' || k === 'hook') return null;
  const L = L0.slice(),
    sb = !!o.sb;
  if (k === 'cut' && sb && !bdSlashCut(L, sl)[0]) {
    // #679 행님 11/08: 컷 첫 글 줄 맨 앞에서 '/컷' = 앞에 빈 컷 하나 — 그 컷의 화면 메모·사진은 글과 같이 남음
    const ty = new Map(bdScParse(L.join('\n')).map((b) => [b.line, b.t === 'say' && !b.text.trim() ? 'gap' : b.t]));
    let p = sl.line;
    while (p > 0 && (ty.get(p - 1) === 'dir' || ty.get(p - 1) === 'gap')) p--;
    if (p < sl.line && [...Array(sl.line - p).keys()].some((x) => ty.get(p + x) === 'dir') && (p === 0 || ty.get(p - 1) === 'cut')) {
      L[sl.line] = bdSlashCut(L, sl)[1];
      L.splice(p, 0, '', '-장면 전환-');
      return { L, line: sl.line + 2, at: 0 };
    }
  }
  const [x, y] = bdSlashCut(L, sl); // 빈 줄이면 x·y 둘 다 없음 = 그 줄 자리에 카드
  if (k === 'cut' && sb && x && !y && !/^자막\s*:/.test(L[sl.line] || '')) {
    // #682 행님 11/08: TTS 줄 끝 '/컷' = 그 줄에 딸린 바로 아래 자막 줄들은 이 컷에 남기고 그 뒤에서 나눔
    L[sl.line] = x;
    let q = sl.line + 1;
    while (/^자막\s*:/.test(L[q] || '')) q++;
    L.splice(q, 0, ...bdAddLines(d, o.me));
    if (q + 1 >= L.length || bdScParse(L[q + 1])[0]?.t === 'cut') L.splice(q + 1, 0, ''); // 새 컷에 쓸 줄
    return { L, line: q + 1, at: 0 };
  }
  L.splice(sl.line, 1, ...(x ? [x] : []), ...bdAddLines(d, o.me), ...(y ? [y] : []));
  if (k === 'cut' && sb) {
    // #670 스토리보드 컷 나누기 = 커서는 새 컷 첫 줄 맨 앞(전환 줄은 스토리보드에서 안 보임 #666) · 대본 끝이면 빈 줄 하나
    const nx = sl.line + (x ? 1 : 0) + 1;
    if (nx >= L.length || bdScParse(L[nx])[0]?.t === 'cut') L.splice(nx, 0, ''); // #682 바로 다음이 컷이어도 빈 줄 하나
    return { L, line: nx, at: 0 };
  }
  return { L, line: sl.line + (x ? 1 : 0) + d[3], at: 'end' };
}
// ＋ 넣기(막대 단추): 커서가 있는 줄 덩어리(scAt) 뒤에 넣음. o = {scAt, me} → { L, line, at } (없는 종류면 null)
function bdInsertRule(L0, k, o) {
  const d = BD_SC_ADD.find((x) => x[0] === k);
  if (!d || k === 'ov' || k === 'hook') return null;
  const L = L0.slice(),
    scAt = o.scAt,
    cur = bdScParse(L.join('\n')).find((b) => scAt != null && b.line <= scAt && scAt <= (b.end ?? b.line));
  let at = cur ? (cur.end ?? cur.line) + 1 : L.length;
  const repl = !cur && L.length && !L.at(-1).trim(); // 끝 빈 줄이면 그 자리에
  if (repl) at = L.length - 1;
  L.splice(at, repl ? 1 : 0, ...bdAddLines(d, o.me));
  if (L.length === d[2].length + 1 && !L.at(-1) && at === 0) L.pop(); // 처음 빈 대본
  return { L, line: at + d[3], at: 'end' };
}
// 후킹 줄 켜고 끄기(#499): sl = '/후킹' 자리({line, at, end}) 또는 null · o.at = 단추로 열 때의 줄. 글 줄이 아니면 null
function bdHookRule(L0, sl, o) {
  const bl = bdScParse(L0.join('\n')),
    li = sl ? sl.line : o.at ?? bl.findLast((x) => x.t === 'say')?.line ?? 0,
    cur = bl.find((x) => x.line === li && x.t === 'say');
  if (!cur) return null;
  const L = L0.slice();
  let t = cur.text;
  if (sl && typeof sl.at === 'number') {
    const x = t.slice(0, sl.at).replace(/\s+$/, ''),
      y = t.slice(sl.end).replace(/^\s+/, '');
    t = x && y ? `${x} ${y}` : x || y; // '/후킹'만 빼고 남는 글은 그대로
  } else if (sl) t = '';
  L[li] = (cur.hook ? '' : BD_HOOK) + t;
  return { L, line: li, at: 'end' };
}
// Enter · Backspace 규칙(bdScKey 에서 뗌). L = 줄들 · o = { key, alt, shift, sb, t(줄 종류), i(줄 번호), txt(칸 글), a·b(커서 시작·끝), hook, dirC(이어 쓴 메모), dmEnd, who(말풍선 사람), first(컷 첫 글 줄), from(컷 앞 줄 번호), cardBefore }
// → { L, line, at } 줄을 고침 · { pick:'cut', sl } 컷 나누기 · { card:true } 앞 카드 고르기 · null = 브라우저 기본대로
function bdKeyRule(L0, o) {
  const L = L0.slice(),
    { t, i, txt, a, b } = o,
    sb = !!o.sb,
    del = () => {
      L.splice(i, 1);
      if (!L.length) L.push('');
      return { L, line: Math.max(0, i - 1), at: 'end' };
    };
  if (o.key === 'Enter') {
    if (o.alt && sb && (t === 'say' || t === 'sub')) return { pick: 'cut', sl: { line: i, q: '', at: a, end: a } }; // #686 Alt+Enter = 커서 자리에서 컷 나누기
    if (sb && !o.shift && !txt.trim() && (t === 'say' || t === 'sub')) {
      L[i] = t === 'say' ? '자막: ' : ''; // #678 스토리보드 빈 줄에서 Enter = TTS → 자막 → TTS(새 줄 대신 줄 종류만)
      return { L, line: i, at: 'end' };
    }
    if (t === 'say') {
      const hk = o.hook ? BD_HOOK : ''; // #499 줄을 가르면 후킹은 앞 조각에(맨 앞에서 치면 글이 있는 쪽에)
      if (hk && !a && txt) {
        L[i] = '';
        L.splice(i + 1, 0, hk + txt.slice(b));
        return { L, line: i + 1, at: 0 };
      }
      L[i] = hk + txt.slice(0, a);
      L.splice(i + 1, 0, txt.slice(b));
      return { L, line: i + 1, at: 0 };
    }
    if (t === 'msg') {
      L.splice(i + 1, 0, `${o.who}: `); // 같은 사람 다음 말
      return { L, line: i + 1, at: 0 };
    }
    if (t === 'dir' && sb) {
      // #686 메모 가운데서 Enter = 커서 뒤 글이 다음 줄로(사진은 윗줄에 그대로)
      const p = bdScParse(L[i] || '')[0] || {},
        x = txt.slice(0, a).replace(/\s+$/, ''),
        y = txt.slice(b).replace(/^\s+/, '');
      L[i] = `[${[x, p.img ? '사진:' + p.img : ''].filter(Boolean).join(' · ') || ' '}]`;
      L.splice(i + 1, 0, `[${y || ' '}]`);
      return { L, line: i + 1, at: 0 };
    }
    const end = t === 'dm' ? o.dmEnd : i;
    L.splice(end + 1, 0, '');
    return { L, line: end + 1, at: 0 };
  }
  if (o.key === 'Backspace' && a === 0 && b === 0) {
    if (t === 'dir' && o.dirC && !txt.trim()) {
      L.splice(i, 1); // #676 빈 이어 쓴 메모 줄 첫머리 = 그 줄 지우고 위 메모 끝으로
      return { L, line: i - 1, at: 'end' };
    }
    if (t === 'dir' && o.dirC) {
      // #681 글 있는 이어 쓴 메모 줄 첫머리 Backspace = 윗줄에 붙임(띄어쓰기 하나) — 사진은 윗줄 것 그대로
      const p = bdScParse(L[i - 1])[0] || { text: '' },
        pt = (p.text || '').replace(/\s+$/, ''),
        nt = pt ? pt + ' ' + txt.trim() : txt.trim();
      L[i - 1] = `[${[nt, p.img ? '사진:' + p.img : ''].filter(Boolean).join(' · ')}]`;
      L.splice(i, 1);
      return { L, line: i - 1, at: pt ? pt.length + 1 : 0 };
    }
    if (sb && (t === 'say' || t === 'sub') && o.first) {
      const c = o.from;
      if (c >= 0 && c < i && bdScParse(L[c] || '')[0]?.t === 'cut') {
        L.splice(c, 1); // #686 컷 첫 글 줄 맨 앞 Backspace = 앞 컷에 붙임(한 번에)
        return { L, line: i - 1, at: 0 };
      }
    }
    if (t === 'say' && o.hook) {
      L[i] = txt; // #499 후킹 줄 첫머리에서 지우기 = 후킹 표시만 풀림(글은 그대로)
      return { L, line: i, at: 0 };
    }
    if (t === 'say' && !txt && i > 0) return del();
    if (t === 'say' && txt && o.cardBefore) return { card: true }; // #495 카드 바로 아래 줄 첫머리 = 카드를 먼저 고름
    if (t === 'say' && txt && i > 0 && bdScParse(L[i - 1]).every((x) => x.t === 'say')) {
      const n = L[i - 1].length;
      L[i - 1] += L[i];
      L.splice(i, 1);
      return { L, line: i - 1, at: n };
    }
    if (t === 'msg' && !txt) return del();
    if (/^(cut|sub|dir)$/.test(t) && !txt) return del();
  }
  return null;
}

// ---------- #900 같이 고치기(실시간) 규칙 — 순수 함수만. server/linemerge.py 와 같은 규칙(같은 시험 표 tests/merge900_cases.json) · 웹 보드도 이 파일을 그대로 씀 ----------
// 줄 단위 3자 합치기: base = 둘이 같이 불러온 글 · cur = 남이 고친 글 · mine = 내 글. → { ok, text, n }
//   겹치는 줄이 없으면 둘의 고침을 다 넣은 글. 같은 줄을 서로 다르게 고쳤으면 ok:false(opt.mineWins 이면 그 줄만 내 것 · ok:true · n = 겹친 덩어리 수)
//   바뀐 덩어리가 겹치면 한 묶음: (1) 두 결과가 같으면 그대로 (2) 한쪽 고침이 다른 쪽 고침 안에 다 들어 있으면(내가 남의 고침을 이미 받아 넣은 글) 큰 쪽 (3) 아니면 겹침
const BD_LCS_MAX = 1000000; // 가운데 줄 수 곱이 이보다 크면 한 덩어리(겹침으로 봄 — 안전한 쪽)
const bdLinesOf = (s) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').split('\n');
const bdArrEq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
function bdDiffLines(A, B) {
  // A → B 바뀐 덩어리들 [{a, b, r}] = A[a..b) 를 줄 목록 r 로 바꿈(a===b 끼워 넣기 · r 이 비면 지우기)
  const n = A.length,
    m = B.length;
  let p = 0,
    s = 0;
  while (p < n && p < m && A[p] === B[p]) p++;
  while (s < n - p && s < m - p && A[n - 1 - s] === B[m - 1 - s]) s++;
  const a = A.slice(p, n - s),
    b = B.slice(p, m - s),
    la = a.length,
    lb = b.length;
  if (!la && !lb) return [];
  if (!la || !lb || la * lb > BD_LCS_MAX) return [{ a: p, b: p + la, r: b }];
  const w = lb + 1,
    dp = new Int32Array((la + 1) * w);
  for (let i = la - 1; i >= 0; i--)
    for (let j = lb - 1; j >= 0; j--) dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const out = [];
  let i = 0,
    j = 0,
    cur = null;
  while (i < la || j < lb) {
    if (i < la && j < lb && a[i] === b[j]) {
      if (cur) {
        out.push(cur);
        cur = null;
      }
      i++;
      j++;
      continue;
    }
    if (!cur) cur = { a: p + i, b: p + i, r: [] };
    if (j >= lb || (i < la && dp[(i + 1) * w + j] >= dp[i * w + j + 1])) {
      i++;
      cur.b = p + i;
    } else cur.r.push(b[j++]);
  }
  if (cur) out.push(cur);
  return out;
}
const bdHasSub = (big, small) => {
  for (let i = 0; i + small.length <= big.length; i++) {
    let k = 0;
    while (k < small.length && big[i + k] === small[k]) k++;
    if (k === small.length) return true;
  }
  return false;
};
function bdHunkIn(s, big, B) {
  // 고침 s 가 고침 big 안에 다 들어 있나(big 이 s 의 범위를 덮고, s 가 넣은 줄이 big 이 넣은 줄 안에 이어서 있음 · s 가 지운 줄이면 big 이 그 줄을 안 되살림)
  if (!(big.a <= s.a && s.b <= big.b)) return false;
  if (s.r.length) return bdHasSub(big.r, s.r);
  if (big.a === s.a && big.b === s.b) return false; // 같은 줄을 한쪽은 지우고 한쪽은 고침 = 겹침
  return !B.slice(s.a, s.b).some((x) => big.r.includes(x));
}
const bdOv = (h, ga, gb) => (h.a < gb && ga < h.b) || h.a === ga;
// #904 같이 고치기 중 저장 겹침: 겹친 곳에서 남의 줄이 모두 '내가 이미 본 줄'(같이 고치기로 받았거나 내가 쳤던 줄)이면
// 남의 저장은 내 글의 옛 판일 뿐(내가 치던 줄의 반쯤 친 모습 등) → 겹쳐도 내 글로 합침. 처음 보는 줄이 하나라도 있으면 null(막대로 물어봄)
function bdSeenWins(base, cur, mine, seen) {
  const m = bdMerge3(base, cur, mine, { seen });
  return m.ok ? m.text : null;
}
const BD_SEEN_MAX = 4000;
function bdSeenAdd(seen, text) {
  // 본 줄 모음에 이 글의 줄들을 더함(너무 커지면 처음부터)
  if (!seen) return;
  if (seen.size > BD_SEEN_MAX) seen.clear();
  for (const x of bdLinesOf(text)) seen.add(x);
}
function bdMerge3(base, cur, mine, opt) {
  const win = !!(opt && opt.mineWins),
    seen = (opt && opt.seen) || null,
    B = bdLinesOf(base),
    C = bdLinesOf(cur),
    M = bdLinesOf(mine);
  if (bdArrEq(C, B)) return { ok: true, text: M.join('\n'), n: 0 };
  if (bdArrEq(M, B)) return { ok: true, text: C.join('\n'), n: 0 };
  if (bdArrEq(C, M)) return { ok: true, text: M.join('\n'), n: 0 };
  const H1 = bdDiffLines(B, C),
    H2 = bdDiffLines(B, M),
    out = [];
  let pos = 0,
    i = 0,
    j = 0,
    bad = 0;
  while (i < H1.length || j < H2.length) {
    const g1 = [],
      g2 = [];
    let h0;
    if (j >= H2.length || (i < H1.length && H1[i].a <= H2[j].a)) g1.push((h0 = H1[i++]));
    else g2.push((h0 = H2[j++]));
    const ga = h0.a;
    let gb = h0.b;
    for (;;) {
      let took = false;
      if (i < H1.length && bdOv(H1[i], ga, gb)) {
        gb = Math.max(gb, H1[i].b);
        g1.push(H1[i++]);
        took = true;
      }
      if (j < H2.length && bdOv(H2[j], ga, gb)) {
        gb = Math.max(gb, H2[j].b);
        g2.push(H2[j++]);
        took = true;
      }
      if (!took) break;
    }
    const seg = (g) => {
      const r = [];
      let q = ga;
      for (const h of g) {
        for (; q < h.a; q++) r.push(B[q]);
        for (const x of h.r) r.push(x);
        q = h.b;
      }
      for (; q < gb; q++) r.push(B[q]);
      return r;
    };
    let res;
    if (!g2.length) res = seg(g1);
    else if (!g1.length) res = seg(g2);
    else {
      const sc = seg(g1),
        sm = seg(g2);
      if (bdArrEq(sc, sm)) res = sm;
      else if (g1.every((h) => g2.some((k) => bdHunkIn(h, k, B)))) res = sm;
      else if (g2.every((h) => g1.some((k) => bdHunkIn(h, k, B)))) res = sc;
      else if (seen && sc.every((x) => seen.has(x))) res = sm; // #904 겹친 곳의 남의 줄이 다 '내가 본 줄'(같이 고치기로 받았거나 내가 쳤던 줄) = 내 글의 옛 판 → 내 것
      else if (win) {
        res = sm;
        bad++;
      } else return { ok: false, text: null, n: 1 };
    }
    for (let q = pos; q < ga; q++) out.push(B[q]);
    for (const x of res) out.push(x);
    pos = gb;
  }
  for (let q = pos; q < B.length; q++) out.push(B[q]);
  return { ok: true, text: out.join('\n'), n: bad };
}
// 줄 번호 옮기기: old 줄 목록의 l 번째 줄이 new 줄 목록에서 몇 번째인가(앞에서 줄이 늘고 줄어도 커서·잠금이 따라감)
function bdLineMap(oldL, newL, l) {
  let shift = 0;
  for (const h of bdDiffLines(oldL, newL)) {
    if (l >= h.b) shift += h.r.length - (h.b - h.a);
    else if (l >= h.a) return Math.max(0, Math.min(newL.length - 1, h.a + shift));
    else break;
  }
  return Math.max(0, Math.min(newL.length - 1, l + shift));
}
// 보낼 고침: old 글 → now 글 = old 의 줄 [from, to) 를 lines 로(앞뒤 같은 줄은 뺌). 같으면 null
function bdLineHunk(oldT, nowT) {
  if (oldT === nowT) return null;
  const A = String(oldT).split('\n'),
    B = String(nowT).split('\n');
  let p = 0,
    s = 0;
  while (p < A.length && p < B.length && A[p] === B[p]) p++;
  while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  return { from: p, to: A.length - s, lines: B.slice(p, B.length - s) };
}
function bdApplyHunk(text, h) {
  // 받은 고침을 글에 적용 — 범위가 글 밖이면 null(보낸 쪽 글과 내가 아는 글이 다름 = 전체를 부탁해야 함)
  const L = String(text).split('\n');
  if (!h || !Array.isArray(h.lines) || !(h.from >= 0 && h.from <= h.to && h.to <= L.length)) return null;
  return [...L.slice(0, h.from), ...h.lines, ...L.slice(h.to)].join('\n');
}
// 글 짧은 지문(32비트 FNV-1a + 길이) — '보낸 쪽 직전 글 = 내가 아는 보낸 쪽 글' 확인용
function bdTextHash(s) {
  s = String(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16) + '.' + s.length;
}
// 받은 말 한 개 처리(상태 기계): peer = 내가 아는 보낸 사람의 글 { text, seq } 또는 null · m = 받은 말 { seq, base, from, to, lines } 또는 { seq, full } · mine = 내 글 · anc = 처음 만난 사람 글을 합칠 때 기준(내가 불러온 글)
// → { act:'apply'|'want'|'drop', peer(새로 아는 보낸 사람 글), text(내 새 글), from·to(합칠 때 쓴 기준 · 새 글 — 되돌리기 기록에도 같이 넣음), n(내 것을 둔 덩어리 수) }
//   순서 뒤바뀜(seq 가 작거나 같음) = drop · 빠진 말(seq 건너뜀)·지문 다름·범위 밖 = want(전체를 부탁)
function bdLiveRecv(peer, m, mine, anc) {
  if (m.full != null) {
    const t = String(m.full);
    if (peer && m.seq < peer.seq) return { act: 'drop' };
    const old = peer ? peer.text : anc == null ? mine : anc,
      r = bdMerge3(old, t, mine, { mineWins: true });
    return { act: 'apply', peer: { text: t, seq: m.seq }, text: r.text, from: old, to: t, n: r.n };
  }
  if (!peer) return { act: 'want' };
  if (m.seq <= peer.seq) return { act: 'drop' };
  if (m.seq !== peer.seq + 1 || m.base !== bdTextHash(peer.text)) return { act: 'want' };
  const t = bdApplyHunk(peer.text, m);
  if (t == null) return { act: 'want' };
  const r = bdMerge3(peer.text, t, mine, { mineWins: true });
  return { act: 'apply', peer: { text: t, seq: m.seq }, text: r.text, from: peer.text, to: t, n: r.n };
}
// 줄 잠금 = { who, c(보낸 창), line, hint(그 줄 글 앞 12자), since(그 줄을 잡은 시각), seen }. 5초 소식 없으면 풂
const BD_LK_TTL = 5000;
function bdLkWin(a, b) {
  // 같은 줄을 동시에 잡았을 때 a 가 이기나: 먼저 잡은 사람(since 작은 쪽) → 같으면 이름 가나다 앞쪽 → 같으면 창 번호
  if (a.since !== b.since) return a.since < b.since;
  const w = String(a.who).localeCompare(String(b.who), 'ko');
  return w ? w < 0 : String(a.c) < String(b.c);
}
function bdLkFind(L, line, hint) {
  // 보낸 쪽 줄 번호 → 내 글에서의 줄 번호: 같은 번호 줄이 그 글로 시작하면 그 줄 · 아니면 그 글로 시작하는 가장 가까운 줄(앞에서 줄이 늘어 밀렸을 때) · 못 찾으면 번호 그대로
  if (line == null || line < 0 || !L.length) return -1;
  const h = hint || '';
  if (!h || (line < L.length && L[line].startsWith(h))) return line < L.length ? line : L.length - 1;
  let best = -1;
  for (let i = 0; i < L.length; i++) if (L[i].startsWith(h) && (best < 0 || Math.abs(i - line) < Math.abs(best - line))) best = i;
  return best >= 0 ? best : line < L.length ? line : -1;
}
/* ---- 아이콘(app.js BD_ICONS) ---- */
const ICONS = {
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l2-3h4l2 3"/>',
  cart: '<path d="M3 4h2l2 11h11l2-8H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  cut: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.4 20 17.5M8.6 15.6 20 6.5"/>',
  text: '<path d="M5 5.5h14M12 5.5v13"/>',
  chat: '<path d="M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-6l-4 3.5v-3.5H6A2.5 2.5 0 0 1 3.5 14V7A2.5 2.5 0 0 1 6 4.5z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  hook: '<circle cx="14" cy="4.5" r="1.8"/><path d="M14 6.3V15a5 5 0 0 1-10 0v-2.5l3 2.5"/>'
};
/* ---- tools/webboard/dsb_view.js ---- */
// 웹 보드용 '보기 전용' 그리기 — Devis app.js 의 bdScHtml · bdSbHtml · bdSbDirs · bdTtsDraw 와 같은 HTML 구조·클래스 이름(고치기 손잡이·＋ 단추·끌기만 뺌).
// build.py 가 앞에 sbcore.js 와 ICONS(아이콘 선 그림)를 이어 붙임. 이 파일은 손으로 고치는 원본 — 결과 파일(devis-storyboard.js)을 직접 고치지 말 것.
const PH_LABEL = '사진(PC에 있음)';
const BD_ME_NAME = '세종'; // 웹 보드(세종아 방) DM 의 내 쪽 이름 — Devis 우리 판과 같음
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const icon = (name, sz) =>
  `<svg class="bdIc" viewBox="0 0 24 24"${sz ? ` width="${sz}" height="${sz}" style="vertical-align:-0.15em;flex:none"` : ''} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
// Devis 의 bdEd(고치는 칸)와 같은 이름 · 보기 전용 = contenteditable 없음 · 고치기(edit:true) = Devis 와 같은 contenteditable="plaintext-only" + 칸 이름(data-f) + 자리 글(data-ph)
let EDIT = false;
const ed = (f, v, p = BD_PH[f]) =>
  EDIT ? `<span class="bdEd" contenteditable="plaintext-only" spellcheck="false" data-f="${f}" data-ph="${esc(p)}">${esc(v)}</span>` : `<span class="bdEd">${esc(v)}</span>`;
const ph = (small) => `<span class="bdScPh">${icon('camera')}<small>${esc(small || PH_LABEL)}</small></span>`;

function secH(k, bt, inner) {
  const h = `<b>#${k}</b><span class="bdSecNm">${esc(bt.text)}</span>${bt.how ? `<small>${esc(bt.how)}</small>` : ''}`;
  return inner ? `<span class="bdSecH">${h}</span>` : `<div class="bdSecH0" data-sec="${k}"><span class="bdSecH">${h}</span></div>`;
}

function ovHtml(b, at) {
  const flow = b.beats
    .map((x, k) => `<span class="st" data-ov="${k}"><i>${k + 1}</i><span>${esc(x.text)}${x.how ? `<small>${esc(x.how)}</small>` : ''}</span></span>`)
    .join('<span class="ar">›</span>');
  return `<div class="bdScOv"${at}><div class="ovH"><b>개요</b>${b.beats.length ? `<div class="bdOvFlow">${flow}</div>` : ''}</div></div>`;
}

function makeOne(bl) {
  const ov = bl.find((b) => b.t === 'ov');
  let cutN = 0;
  return (b) => {
    const at = ` data-line="${b.line}" data-t="${b.t}"`;
    if (b.t === 'say') return `<div class="bdScSay${b.hook ? ' hook' : ''}${!b.text && ov && b.line === ov.end + 1 ? ' bdOvGap' : ''}"${at}${b.hook ? ' data-hook="1"' : ''}>${ed('say', b.text)}</div>`;
    if (b.t === 'ov') return b === ov ? ovHtml(b, at) + (b.beats[0] ? secH(1, b.beats[0], '') : '') : '';
    if (b.t === 'cut') {
      const k = ov && b.line > ov.end ? ++cutN + 1 : 0,
        bt = k && ov.beats[k - 1];
      return bt
        ? `<div class="bdScCut sec"${at} data-sec="${k}">${secH(k, bt, 'in')}${EDIT ? `<span class="bdSecEd" hidden>${ed('cut', b.text)}</span>` : ''}</div>`
        : `<div class="bdScCut"${at}><span>${ed('cut', b.text)}</span>${k ? `<span class="bdSecN">#${k}</span>` : ''}</div>`;
    }
    if (b.t === 'sub') return `<div class="bdScSubW"${at}><span class="bdScSub">${ed('sub', b.text)}</span></div>`;
    if (b.t === 'dir')
      return `<div class="bdScDir bdSbDir"${at}${EDIT && b.img ? ` data-img="${esc(b.img)}"` : ''}><span class="bdSbPic${b.img ? '' : ' none'}">${icon('camera', 16)}${b.img ? `<small>${PH_LABEL}</small>` : ''}</span>${ed('dir', b.text, BD_PH.dir)}</div>`;
    if (b.t === 'shop')
      return `<div class="bdScShop"${at} data-shop="${esc(b.shop)}"${EDIT ? ` data-note="${esc(b.note)}"` : ''}><span class="bdScImg">${icon('cart')}</span><span class="bdScShopT"><small>${esc(b.shop)}</small><b>${ed('name', b.name)}</b><em>${ed('price', b.price)}</em></span></div>`;
    if (b.t === 'yt')
      return `<div class="bdScYt"${at}${EDIT ? ` data-head="${esc(b.head)}"` : ''}><span class="bdScAv"></span><span><small>${ed('yname', b.name)} · 2시간 전</small>${ed('ytext', b.text)}<small class="bdScLk">${icon('heart')} 289 · 답글</small></span></div>`;
    if (b.t === 'dm') {
      const slot = b.photo || b.img ? `<div class="bdScPhoto">${b.img ? ph() : ''}${b.photo ? `<small>${esc(b.photo)}</small>` : ''}</div>` : '';
      const msgs = b.msgs
        .map(
          (m) =>
            `<div class="bdScMsg${BD_ME.test(m.who) ? ' me' : ''}${m.img || m.ph ? ' pic' : ''}" data-line="${m.line}" data-t="msg" data-who="${esc(m.who)}">${m.img || m.ph ? ph() : ed('msg', m.text)}</div>`
        )
        .join('');
      const add = EDIT ? `<div class="bdScDmAdd"><button data-dm="other" tabindex="-1">＋ ${esc(b.who)}</button><button data-dm="me" tabindex="-1">＋ ${BD_ME_NAME}</button></div>` : '';
      return `<div class="bdScDm"${at}${EDIT ? ` data-end="${b.end}"` : ''} data-who="${esc(b.who)}"><div class="bdScDmH"><span class="bdScAv"></span><b>${ed('who', b.who)}</b><span class="sep"></span><small>DM</small></div>${slot}${msgs}${add}</div>`;
    }
    return '';
  };
}

// 장면 메모(오른쪽 '화면' 칸) — Devis bdSbDirs 와 같은 묶음(바로 이어진 메모 줄은 한 칸, 사진 있는 메모는 따로)
function dirsHtml(D, one) {
  const gs = [];
  for (const b of D) {
    const p = gs.at(-1);
    if (p && !b.img && p.at(-1).line === b.line - 1) p.push(b);
    else gs.push([b]);
  }
  return gs
    .map(([f, ...cs]) => {
      if (!EDIT) {
        cs = cs.filter((c) => c.text.trim());
        if (!f.img && !f.text.trim() && !cs.length) return ''; // 보기 전용: 빈 메모 = 안 그림(고치기에선 Devis 처럼 칸이 보임)
      }
      const n = cs.length + 1,
        h = one(f)
          .replace('<div class="bdScDir bdSbDir"', `<div style="grid-template-rows:repeat(${n}, auto) 1fr" class="bdScDir bdSbDir"`)
          .replace('<span class="bdSbPic', `<span style="grid-row:1 / span ${n + 1}" class="bdSbPic`);
      return cs.length ? h.slice(0, -6) + cs.map((c) => `<div class="bdScDir bdSbDirC" data-line="${c.line}" data-t="dir">${ed('dir', c.text, '')}</div>`).join('') + '</div>' : h;
    })
    .join('');
}

function sbHtml(body) {
  const bl = bdScParse(body),
    one = makeOne(bl),
    { pre, gs } = bdSbSplit(bl),
    fr = gs.map((g) => (g.cut ? g.cut.line : g.items.length ? g.items[0].line : 0)); // 컷마다 글 줄 자리(전환 줄부터 다음 컷 앞까지)
  return (
    pre.map(one).join('') +
    gs
      .map((g, i) => {
        const L = g.items.filter((b) => b.t !== 'dir'),
          D = g.items.filter((b) => b.t === 'dir'),
          at = g.cut ? g.cut.line + 1 : g.items.length ? g.items[0].line : 0,
          right = D.length ? dirsHtml(D, one) : EDIT ? `<button class="bdSbAdd" data-sbadd="${at}" tabindex="-1"><span class="bdSbPic none">${icon('camera', 16)}</span><span>＋ 화면(장면 메모)</span></button>` : dirsHtml(D, one);
        return (
          `${g.cut ? one(g.cut) : ''}<div class="bdSb"${EDIT ? ` data-sbfrom="${fr[i]}" data-sbto="${fr[i + 1] ?? ''}"` : ''}><div class="bdSbRow"><span class="bdSbN" aria-label="컷 ${i + 1}">${i + 1}</span>` +
          `<div class="bdSbCol bdSbL" data-sbat="${at}">${L.map(one).join('')}</div>` +
          `<div class="bdSbCol bdSbR" data-sbat="${at}"${EDIT ? ` data-sbdirs="${D.map((b) => b.line).join(',')}"` : ''}>${right}</div></div></div>`
        );
      })
      .join('') +
    (EDIT ? `<button class="bdSbNew" data-sbnew="1" tabindex="-1">＋ 다음 장면 (컷 ${gs.length + 1})</button>` : '')
  );
}

function ttsHtml(body) {
  const gs = bdTtsGroups(body),
    nl = gs.reduce((a, l) => a + l.length, 0),
    nc = gs.reduce((a, l) => a + l.reduce((b, t) => b + t.length, 0), 0);
  return (
    `<div class="bdTtsView"><div class="bdTtsSum"><b class="bdTtsTot">${nl ? `${nl}줄 · ${nc}자` : 'TTS 줄이 없어요'}</b></div><div class="bdTtsBody">` +
    gs
      .map((ls, i) => `<div class="bdTtsCut"><span class="bdTtsN">${i + 1}</span><div class="bdTtsL">${ls.length ? ls.map((t) => `<p>${esc(t)}</p>`).join('') : '<p class="muted">TTS 없음</p>'}</div></div>`)
      .join('') +
    `</div></div>`
  );
}

// 꼭 찍을 장면 — 글 줄(또는 {text, done})들 · 끝낸 줄은 초록 체크(취소선 없음)
function mustItems(m) {
  const L = Array.isArray(m) ? m : String(m || '').split('\n');
  return L.map((x) => (typeof x === 'string' ? { text: x.trim(), done: /^\s*(\[[xX✓]\]|✓|☑)\s*/.test(x) } : { text: String(x.text || '').trim(), done: !!x.done })).map((x) => ({ ...x, text: x.text.replace(/^\s*(\[[ xX✓]?\]|✓|☑|☐)\s*/, '') })).filter((x) => x.text);
}
function mustHtml(m) {
  const it = mustItems(m);
  if (!it.length) return '';
  const n = it.filter((x) => x.done).length;
  return `<div class="dsbMust"><div class="dsbMustH"><b>꼭 찍을 장면</b><span class="dsbMustN">${n}/${it.length}</span></div>${it.map((x) => `<div class="dsbMustI${x.done ? ' done' : ''}"><i></i><span>${esc(x.text)}</span></div>`).join('')}</div>`;
}

// ---------- 고치기(edit:true) — 스토리보드 보기에서 Devis 대본 보드처럼 줄을 바로 고침 ----------
// 글 규칙(Enter · Backspace · ＋ 넣기 · 후킹 · 줄 → 글)은 sbcore.js 의 bdKeyRule · bdPickRule · bdInsertRule · bdHookRule · bdScLineOf 를 Devis 와 같이 씀.
// 여기는 화면 쪽(칸에서 값 읽기 · 커서 · 되돌리기 기록 · 넣기 목록)만 — Devis app.js 의 bdScKey · bdScDraw · bdScSnap · bdScUndo · bdAddOpen 과 같은 규칙.
function caretIn(e, at) {
  e.focus();
  const sel = getSelection(),
    rg = document.createRange(),
    len = e.textContent.length,
    n = at === 'end' ? len : at === 'all' ? 0 : Math.min(+at || 0, len),
    tn = e.firstChild;
  if (at === 'all') rg.selectNodeContents(e);
  else if (tn && tn.nodeType === 3) {
    rg.setStart(tn, n);
    rg.collapse(true);
  } else {
    rg.selectNodeContents(e);
    rg.collapse(at !== 'end');
  }
  sel.removeAllRanges();
  sel.addRange(rg);
}
function caretOf(e) {
  const sel = getSelection();
  if (!sel.rangeCount || !e.contains(sel.anchorNode)) return { a: 0, b: 0 };
  const r = sel.getRangeAt(0),
    pre = document.createRange();
  pre.selectNodeContents(e);
  pre.setEnd(r.startContainer, r.startOffset);
  const a = pre.toString().length;
  return { a, b: a + r.toString().length };
}

function mountEdit(el) {
  const COMP_STALE = 1500; // #904 조합 소식이 이만큼(ms) 없으면 조합 끝으로 봄
  const I = { body: '', hist: [], fut: [], at: null, addAt: null, kind: null, kt: 0, drawing: false, opt: {}, sig: null, drawn: false, subs: [], seen: new Set() }; // #904 seen = 이 칸에서 본 줄(친 줄·받은 줄)
  const $v = () => el.querySelector('.bdScView'),
    $m = () => el.querySelector('.bdAddMenu'),
    lines = () => I.body.split('\n');
  const on = (t, ev, fn, cap) => {
    t.addEventListener(ev, fn, cap);
    I.subs.push(() => t.removeEventListener(ev, fn, cap));
  };
  const setBody = (t) => {
    if (t === I.body) return;
    I.body = t;
    bdSeenAdd(I.seen, t);
    try {
      if (I.opt.onChange) I.opt.onChange(t);
    } catch (e) {
      console.error(e);
    }
  };
  const snap = (kind) => {
    // Devis bdScSnap — 이어서 치는 건 1초 안이면 한 번으로
    const now = Date.now();
    if (kind === 'type' && I.kind === 'type' && now - I.kt < 1000) {
      I.kt = now;
      return;
    }
    if (I.hist.at(-1) !== I.body) I.hist.push(I.body);
    if (I.hist.length > 300) I.hist.shift();
    I.fut = [];
    I.kind = kind;
    I.kt = now;
  };
  const draw = (focus) => {
    const vw = $v();
    if (!vw) return;
    I.drawing = true; // 그리는 중 칸이 빠지며 나는 focusout 이 또 그리지 않게
    try {
      EDIT = true;
      vw.innerHTML = sbHtml(I.body);
    } finally {
      EDIT = false;
      I.drawing = false;
    }
    paintLocks(); // #900b 다시 그려도 남이 쓰는 줄 표시 그대로
    if (focus) {
      const row = vw.querySelector(`[data-line="${focus.line}"]`),
        e = row && (focus.f ? row.querySelector(`.bdEd[data-f="${focus.f}"]`) : row.querySelector('.bdEd'));
      if (e && e.getAttribute('contenteditable') !== 'false') caretIn(e, focus.at ?? 'end');
      if (row && !focus.keepScroll) row.scrollIntoView({ block: 'nearest' });
    }
  };
  // ---- #900b 같이 고치기용(웹 보드가 밖에서 부름 — Devis live900.js 와 같은 모양·규칙) ----
  I.lk = []; // [{ line, who, color }] 남이 쓰는 줄
  I.composing = false;
  I.compAt = 0; // #904 마지막 조합 소식 때
  I.pending = null; // 한글 조합 중에 온 남의 글(조합 끝나면 넣음)
  const paintLocks = () => {
    const vw = $v();
    if (!vw) return;
    const was = document.activeElement; // 칸을 끄면 초점이 먼저 빠지므로 끄기 전에 봄
    for (const r of vw.querySelectorAll('.bdLk')) (r.classList.remove('bdLk'), r.style.removeProperty('--lk'));
    for (const e of vw.querySelectorAll('.bdEd[data-lk]')) (e.setAttribute('contenteditable', e.dataset.lk), delete e.dataset.lk);
    for (const x of vw.querySelectorAll('.bdLkTag')) x.remove();
    let blur = null;
    for (const l of I.lk) {
      const row = vw.querySelector(`[data-line="${l.line}"]`);
      if (!row) continue;
      row.classList.add('bdLk');
      row.style.setProperty('--lk', l.color || '#1D4ED8');
      const tag = document.createElement('span');
      tag.className = 'bdLkTag';
      tag.textContent = `${l.who} 쓰는 중`;
      tag.style.background = l.color || '#1D4ED8';
      row.appendChild(tag);
      for (const e of row.querySelectorAll('.bdEd')) {
        if (e.closest('[data-line]') !== row) continue; // 안쪽 다른 줄(DM 말풍선)은 따로
        e.dataset.lk = e.getAttribute('contenteditable') || 'plaintext-only';
        e.setAttribute('contenteditable', 'false');
        if (was === e) blur = e;
      }
    }
    if (blur) {
      blur.blur(); // 내가 있던 줄을 남이 먼저 잡음 — 잠깐 못 고침
      if (I.opt.onLockedOut) I.opt.onLockedOut(I.lk.find((l) => blur.closest(`[data-line="${l.line}"]`)) || I.lk[0]);
    }
  };
  I.setLocks = (list) => {
    I.lk = (list || []).filter((l) => l && l.line != null);
    paintLocks();
  };
  I.cursor = () => {
    const a = document.activeElement,
      e = a && $v() && $v().contains(a) && a.closest('.bdEd'),
      row = e && e.closest('[data-line]');
    if (!row) return null;
    const line = +row.dataset.line;
    return { line, hint: (lines()[line] || '').slice(0, 12) };
  };
  I.remote = (text) => {
    // 남이 고친 글(합친 글)을 넣음 — 내 커서·스크롤·치는 칸 그대로 · 되돌리기 기록에도 같은 고침을 섞어 남의 고침은 안 되돌림
    text = String(text == null ? '' : text);
    if (text === I.body) return;
    if (I.composing && Date.now() - I.compAt < COMP_STALE) {
      // 조합 중 = 끝난 뒤 넣음. #904 compositionend 가 안 오는 때(조합 중 칸이 다시 그려짐 · 폰 자판)를 위해 잠깐 뒤 다시 봄 — 안 그러면 남의 글이 영영 안 들어옴
      I.pending = text;
      clearTimeout(I.compT);
      I.compT = setTimeout(() => {
        if (I.pending != null) {
          const t = I.pending;
          I.pending = null;
          I.remote(t);
        }
      }, COMP_STALE + 50);
      return;
    }
    I.composing = false;
    I.pending = null;
    const old = I.body,
      oldL = old.split('\n'),
      newL = text.split('\n'),
      vw = $v(),
      top = vw ? vw.scrollTop : 0,
      a = document.activeElement,
      e = a && vw && vw.contains(a) && a.closest('.bdEd'),
      row = e && e.closest('[data-line]');
    const focus = row ? { line: bdLineMap(oldL, newL, +row.dataset.line), f: e.dataset.f, at: caretOf(e).a, keepScroll: true } : null;
    const rebase = (h) => {
      const m = bdMerge3(old, text, h, { mineWins: true });
      return m && m.ok ? m.text : h;
    };
    I.hist = I.hist.map(rebase);
    I.fut = I.fut.map(rebase);
    I.body = text; // onChange 안 부름(받은 글을 되돌려 보내지 않게 — 웹 보드가 이 글을 이미 앎)
    bdSeenAdd(I.seen, text);
    if (I.at != null) I.at = bdLineMap(oldL, newL, I.at);
    draw(focus);
    if (vw) vw.scrollTop = top;
  };
  I.take = (text) => {
    // #900c 밖에서 정한 글로 바꾸되 되돌리기 한 칸으로(↶ = 바꾸기 전 내 글) — 충돌 막대 [새 글 보기] 뒤 ↶로 내 글 되찾기. onChange 안 부름(서버 글과 같으니 저장할 것 없음 · ↶ 하면 그때 저장)
    text = String(text == null ? '' : text);
    if (text === I.body) return;
    if (I.hist.at(-1) !== I.body) I.hist.push(I.body);
    if (I.hist.length > 300) I.hist.shift();
    I.fut = [];
    I.kind = null;
    const vw = $v(),
      top = vw ? vw.scrollTop : 0;
    I.body = text;
    bdSeenAdd(I.seen, text);
    I.at = I.at != null ? Math.min(I.at, lines().length - 1) : null;
    draw(null);
    if (vw) vw.scrollTop = top;
  };
  const commit = (r) => {
    snap('edit');
    setBody(r.L.join('\n'));
    draw({ line: r.line, at: r.at });
  };
  const undo = (dir) => {
    const from = dir < 0 ? I.hist : I.fut,
      to = dir < 0 ? I.fut : I.hist;
    if (!from.length) return;
    const line = I.at || 0;
    to.push(I.body);
    setBody(from.pop());
    I.kind = null;
    draw({ line: Math.min(line, lines().length - 1), at: 'end' });
  };
  const note = (msg) => {
    const w = el.querySelector('.bdScF'),
      d = document.createElement('div');
    d.className = 'dsbToast';
    d.textContent = msg;
    w.appendChild(d);
    setTimeout(() => d.remove(), 2200);
  };
  const menuClose = () => {
    const m = $m();
    if (m) m.hidden = true;
  };
  const menuOpen = (anchor) => {
    const m = $m(),
      w = el.querySelector('.bdScF');
    if (!m || !w) return;
    I.addAt = I.at;
    m.hidden = false;
    const wr = w.getBoundingClientRect(),
      ar = anchor.getBoundingClientRect();
    m.style.left = Math.max(0, Math.min(ar.left - wr.left, wr.width - m.offsetWidth)) + 'px';
    m.style.top = ar.bottom - wr.top + 4 + 'px';
  };
  const pick = (k, sl) => {
    // Devis bdAddPick — sl = 줄 가르기(Alt+Enter) · 없으면 막대 [＋ 넣기] = 커서 줄 뒤에
    const at = I.addAt;
    menuClose();
    if (k === 'hook') {
      const r = bdHookRule(lines(), null, { at: at ?? I.at });
      return r ? commit(r) : note('후킹은 대본 글 줄에서 골라 주세요');
    }
    const r = sl ? bdPickRule(lines(), k, sl, { sb: true, me: BD_ME_NAME }) : bdInsertRule(lines(), k, { scAt: at != null ? at : I.at, me: BD_ME_NAME });
    if (r) commit(r);
  };
  const toggleKind = (li) => {
    const L = lines(),
      t = L[li] || '';
    L[li] = /^자막\s*:/.test(t) ? t.replace(/^자막\s*:\s*/, '') : '자막: ' + t.replace(/^\[후킹\]\s*/, '');
    snap('edit');
    setBody(L.join('\n'));
    draw({ line: li, at: 'end' });
    setTimeout(() => {
      const e = $v()?.querySelector(`[data-line="${li}"] .bdEd`);
      if (e) caretIn(e, 'end');
    });
  };

  // --- 글자 입력 → 그 줄 글(Devis 의 beforeinput · input)
  on(el, 'beforeinput', (e) => {
    if (e.target.closest && e.target.closest('.bdScView .bdEd')) snap('type');
  });
  on(el, 'input', (e) => {
    const e0 = e.target.closest && e.target.closest('.bdScView .bdEd');
    if (!e0) return;
    const row = e0.closest('[data-line]'),
      L = lines(),
      i = +row.dataset.line;
    if (row.dataset.t === 'say' && e0.textContent.includes('\n')) {
      const parts = e0.textContent.split('\n'); // 여러 줄을 붙여 넣음 → 줄마다
      if (row.dataset.hook) parts[0] = BD_HOOK + parts[0];
      L.splice(i, 1, ...parts);
      setBody(L.join('\n'));
      return draw({ line: i + parts.length - 1, at: 'end' });
    }
    if (e0.dataset.f === 'who') {
      // 상대 이름을 바꾸면 그 사람 말풍선 줄도 같이
      const old = row.dataset.who,
        nw = e0.textContent.trim() || '친구';
      for (const m of row.querySelectorAll('.bdScMsg')) {
        if (m.dataset.who !== old) continue;
        const j = +m.dataset.line,
          mm = L[j].match(BD_SAY);
        if (mm) L[j] = `${nw}: ${mm[2]}`;
        m.dataset.who = nw;
      }
      row.dataset.who = nw;
    }
    L[i] = bdScLineOf(row, L);
    setBody(L.join('\n'));
  });
  // --- 키(Devis bdScKey)
  on(el, 'keydown', (e) => {
    if (!e.target.closest || !e.target.closest('.bdScF')) return;
    if (e.key === 'Escape' && !$m().hidden) {
      e.preventDefault();
      return menuClose();
    }
    const c = e.ctrlKey || e.metaKey,
      k = e.key.toLowerCase();
    if (c && !e.altKey && (k === 'z' || k === 'y')) {
      e.preventDefault();
      e.stopPropagation();
      return undo(k === 'y' || e.shiftKey ? 1 : -1);
    }
    const e0 = e.target.closest('.bdScView .bdEd');
    if (!e0 || e.isComposing || e.keyCode === 229) return; // 한글 조합 중엔 그대로
    const row = e0.closest('[data-line]'),
      i = +row.dataset.line,
      t = row.dataset.t,
      { a, b } = caretOf(e0),
      txt = e0.textContent;
    if (e.key === 'Enter' || (e.key === 'Backspace' && a === 0 && b === 0)) {
      const box = (t === 'say' || t === 'sub') && row.closest('.bdSb'),
        first = !!box && box.querySelector('.bdSbL > [data-line]') === row,
        r = bdKeyRule(lines(), { key: e.key, alt: e.altKey, shift: e.shiftKey, sb: true, t, i, txt, a, b, hook: !!row.dataset.hook, dirC: row.classList.contains('bdSbDirC'), dmEnd: +row.dataset.end, who: row.dataset.who, first, from: first ? +box.dataset.sbfrom : -1, cardBefore: false });
      if (e.key === 'Enter') e.preventDefault();
      if (r) {
        e.preventDefault();
        return r.pick ? pick(r.pick, r.sl) : commit(r);
      }
    }
    const back = (e.key === 'ArrowUp' || e.key === 'ArrowLeft') && a === 0 && b === 0, // 줄 첫머리에서 ← = 앞 줄 끝
      fwd = (e.key === 'ArrowDown' || e.key === 'ArrowRight') && a === txt.length && b === txt.length;
    if ((back || fwd) && !e.shiftKey && !c && !e.altKey) {
      const all = [...$v().querySelectorAll('.bdEd')].filter((x) => x.offsetParent),
        j = all.indexOf(e0) + (back ? -1 : 1);
      if (all[j]) {
        e.preventDefault();
        caretIn(all[j], back ? 'end' : 0);
      }
    }
  });
  on(el, 'focusin', (e) => {
    const e0 = e.target.closest && e.target.closest('.bdScView .bdEd');
    if (e0) I.at = +e0.closest('[data-line]').dataset.line;
  });
  on(el, 'focusout', (e) => {
    // 줄 모양이 바뀌었으면('[..]'·'자막:'·'-..-'·'이름: 말'을 쳤음) 다시 그림 — 커서는 가던 칸으로
    const e0 = e.target.closest && e.target.closest('.bdScView .bdEd'),
      vw = $v();
    if (!e0 || !vw || I.drawing) return;
    const er = e0.closest('[data-line]'),
      to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.bdScView .bdEd'),
      fr = to && to.closest('[data-line]');
    if (er && er.dataset.t === 'dir' && !er.dataset.img && !e0.textContent.trim()) {
      // #685 빈 화면 메모(사진도 없음)는 다른 데를 누르면 없어짐
      const i = +er.dataset.line,
        j = fr ? +fr.dataset.line : null,
        f = to && to.dataset.f;
      return void setTimeout(() => {
        const b = bdScParse(lines()[i] || '')[0];
        if (!b || b.t !== 'dir' || b.text.trim()) return;
        const L = lines();
        L.splice(i, 1);
        snap('edit');
        setBody(L.join('\n'));
        draw(j == null ? null : { line: j > i ? j - 1 : j, f, at: 'end' });
      });
    }
    const have = [...vw.querySelectorAll('[data-t]')].map((x) => x.dataset.t + x.dataset.line).join(),
      want = bdScParse(I.body)
        .flatMap((b) => [b.t + b.line, ...(b.msgs || []).map((m) => 'msg' + m.line)])
        .join();
    if (have === want) return;
    draw(fr ? { line: +fr.dataset.line, f: to.dataset.f, at: 'end' } : null);
  });
  // --- 단추(넣기 목록 · 되돌리기 · DM ＋)
  on(el, 'click', (e) => {
    const t = e.target;
    if (!t.closest) return;
    const add = t.closest('.bdAddMenu [data-add]'),
      am = t.closest('[data-addmenu]'),
      un = t.closest('[data-undo]'),
      dmB = t.closest('[data-dm]'),
      dmR = t.closest('.bdScDm');
    if (!add && !am && !t.closest('.bdAddMenu')) menuClose();
    if (add) return pick(add.dataset.add);
    if (am) return $m().hidden ? menuOpen(am) : menuClose();
    if (un) return undo(+un.dataset.undo);
    if (dmB && dmR) {
      const end = +dmR.dataset.end,
        who = dmB.dataset.dm === 'me' ? BD_ME_NAME : dmR.dataset.who || '친구',
        L = lines();
      L.splice(end + 1, 0, `${who}: `);
      return commit({ L, line: end + 1, at: 0 });
    }
    const rowC = t.closest('.bdScView [data-line]');
    if (rowC && rowC.dataset.t !== 'dm' && !t.closest('.bdEd, button')) {
      const e0 = rowC.querySelector('.bdEd'); // 줄 빈 곳을 눌러도 그 칸에 커서
      if (e0) caretIn(e0, 'end');
    }
  });
  // 누를 때 바로 도는 것(글 칸을 쓰다 누르면 칸이 빠지며 다시 그려져 click 이 사라짐 — Devis 와 같은 이유) : 빈 '화면' 칸 · 다음 장면 · TTS↔자막 표 · 컷 빈 곳
  on(
    el,
    'pointerdown',
    (e) => {
      if (e.button || !e.target.closest) return;
      const t = e.target,
        ad = t.closest('.bdScView [data-sbadd]'),
        nw = t.closest('.bdScView [data-sbnew]');
      if (ad || nw) {
        e.preventDefault();
        e.stopPropagation();
        const L = lines();
        if (nw) {
          L.push('-장면 전환-', ''); // 다음 장면 = 장면 전환 + 빈 줄(바로 쓰기)
          return commit({ L, line: L.length - 1, at: 'end' });
        }
        const at = +ad.dataset.sbadd;
        L.splice(at, 0, '[ ]'); // 빈 '화면' 칸 누르기 = 장면 메모 줄 넣기(Devis #647)
        return commit({ L, line: at, at: 'end' });
      }
      const sl = !t.closest('button, .bdEd') && t.closest('.bdScView .bdSb')?.querySelector('.bdSbL'),
        tg = t.closest('.bdScView .bdSbL > .bdScSay, .bdScView .bdSbL > .bdScSubW'),
        ted = tg && tg.querySelector('.bdEd');
      if (ted && (ted.textContent.trim() || ted === document.activeElement || tg.classList.contains('bdScSubW')) && !t.closest('.bdEd') && e.clientX < tg.firstElementChild.getBoundingClientRect().left - (parseFloat(getComputedStyle(tg, '::before').marginRight) || 0) + 1) {
        // 줄 앞 'TTS' 표 누르면 자막 · '자막' 표 누르면 TTS(글은 그대로)
        e.preventDefault();
        e.stopPropagation();
        return toggleKind(+tg.dataset.line);
      }
      if (sl && !t.closest('.bdSbR')) {
        const eds = sl.querySelectorAll('.bdScSay .bdEd, .bdScSubW .bdEd'),
          own = t.closest('.bdSbL [data-line]')?.querySelector('.bdEd'); // 줄 안 빈 곳 = 그 줄
        e.preventDefault();
        if (own || eds.length) {
          const ce = own || eds[eds.length - 1],
            at = own && e.clientX < own.getBoundingClientRect().left ? 0 : 'end'; // 글 왼쪽 틈 = 글 맨 앞
          caretIn(ce, at);
          return void setTimeout(() => caretIn(ce, at));
        }
        const at = +sl.dataset.sbat,
          L = lines();
        L.splice(at, 0, ''); // 글 줄이 없는 컷(장면 메모만) = 빈 글 줄 하나
        return commit({ L, line: at, at: 'end' });
      }
    },
    true
  );
  on(document, 'click', (e) => {
    if (el.isConnected && !el.contains(e.target)) menuClose();
  });
  on(el, 'compositionstart', () => ((I.composing = true), (I.compAt = Date.now())), true);
  on(el, 'compositionupdate', () => (I.compAt = Date.now()), true); // #904 조합이 계속되는 동안만 '조합 중'
  on(el, 'focusout', () => (I.composing = false), true);
  on(el, 'compositionend', () => {
    I.composing = false;
    if (I.pending != null) {
      const t = I.pending;
      I.pending = null;
      setTimeout(() => I.remote(t)); // 조합이 끝나 글이 들어간 뒤
    }
  }, true);
  let curLine = null;
  const curTell = () => {
    const c = I.cursor(),
      ln = c ? c.line : null;
    if (ln === curLine) return;
    curLine = ln;
    if (I.opt.onCursor) I.opt.onCursor(c); // { line, hint } 또는 null(칸에서 나감)
  };
  on(document, 'selectionchange', curTell);
  on(el, 'focusout', () => setTimeout(curTell), true);
  I.draw = draw;
  I.off = () => I.subs.splice(0).forEach((f) => f());
  return I;
}

function barHtml() {
  const items = BD_SC_ADD.filter(([k]) => k !== 'ov') // 개요는 웹 보드에서 안 고침
    .map(([k, t]) => `<button data-add="${k}"><span>${BD_ADD_IC[k] ? icon(BD_ADD_IC[k], 15) : ''}</span>${t}</button>`)
    .join('');
  return (
    `<div class="bdScBar"><button class="bdAddBtn" data-addmenu="bar" aria-haspopup="true">＋ 넣기 ▾</button><span class="sep"></span>` +
    `<button class="bdScUndo" data-undo="-1" aria-label="되돌리기">↶</button><button class="bdScUndo" data-undo="1" aria-label="다시 하기">↷</button></div>` +
    `<div class="bdAddMenu" hidden>${items}</div>`
  );
}

// 사용: DevisSB.render(el, body, { view: 'sb' | 'tts' | 'text', mustShots, edit: true, onChange(newBody) })
//  edit:true + view:'sb' = Devis 대본 보드처럼 줄을 바로 고침 · 글이 바뀔 때마다 onChange(대본 글 전체). 같은 글로 다시 render 하면 다시 안 그림(커서 그대로)
function render(el, body, opt) {
  const o = opt || {},
    v = o.view === 'tts' || o.view === 'text' ? o.view : 'sb',
    text = String(body == null ? '' : body),
    edit = v === 'sb' && !!o.edit;
  let I = el._dsbEdit;
  if (!edit && I) {
    I.off();
    el._dsbEdit = I = null;
  }
  el.classList.add('dsb');
  el.classList.toggle('dsbEdit', edit);
  if (edit) {
    const sig = JSON.stringify(o.mustShots == null ? null : o.mustShots);
    if (!I) I = el._dsbEdit = mountEdit(el);
    I.opt = o;
    if (I.drawn && I.body === text && I.sig === sig && el.querySelector('.bdScView')) return el;
    if (I.drawn && I.body !== text) (I.hist = []), (I.fut = []); // 밖에서 바뀐 글 = 되돌리기 기록은 새로
    I.body = text;
    bdSeenAdd(I.seen, text);
    I.sig = sig;
    I.drawn = true;
    el.innerHTML = `<div class="bdF bdScF" data-view="sb">${barHtml()}<div class="bdScView sb" tabindex="-1"></div></div>${mustHtml(o.mustShots)}`;
    I.draw(null);
    return el;
  }
  let inner;
  if (v === 'tts') inner = ttsHtml(text);
  else if (v === 'text') inner = `<div class="bdScView dsbText">${esc(text)}</div>`;
  else inner = `<div class="bdScView sb">${sbHtml(text)}</div>`;
  el.innerHTML = `<div class="bdF bdScF" data-view="${v}">${inner}</div>${mustHtml(o.mustShots)}`;
  return el;
}

// #900 같이 고치기(실시간)·저장 합치기 규칙 — 화면 없는 순수 함수(sbcore.js 그대로). 웹 보드가 Devis 와 같은 broadcast·잠금·합치기를 쓰려고 내보냄
const live = {
  merge3: bdMerge3, // (기준 글, 남이 고친 글, 내 글, { mineWins }) → { ok, text, n } — 서버 저장 합치기(server/linemerge.py)와 같은 규칙
  lineHunk: bdLineHunk, // (옛 글, 새 글) → { from, to, lines } | null — 보낼 고침
  applyHunk: bdApplyHunk,
  textHash: bdTextHash, // 글 지문 — 보낸 말의 base
  recv: bdLiveRecv, // (peer, 받은 말, 내 글, 처음 만난 사람 글을 합칠 기준) → { act:'apply'|'want'|'drop', peer, text, from, to, n }
  lineMap: bdLineMap, // (옛 줄들, 새 줄들, 줄 번호) → 새 줄 번호 — 커서·잠금 줄이 앞에서 줄이 늘고 줄어도 따라감
  lkFind: bdLkFind, // (내 줄들, 보낸 줄 번호, 그 줄 글 앞 12자) → 내 글에서 그 줄 번호
  lkWin: bdLkWin, // 같은 줄을 동시에 잡았을 때 먼저 잡은 사람이 이김
  LK_TTL: BD_LK_TTL, // 5000 — 이 시간(ms) 줄 알림이 없으면 잠금을 풂
  seenWins: bdSeenWins // #904 (기준 글, 남이 저장한 글, 내 글, editor(칸).seen()) → 합친 글 | null — 남의 글에서 내 글에 없는 줄이 다 '내가 본 줄'이면 겹쳐도 내 글(같이 고치는 중 거짓 충돌 막기) · null = 진짜 처음 보는 고침 → 막대
};
// #900b 고치는 칸 손잡이: DevisSB.editor(칸) → { remote(글), setLocks([{line, who, color}]), cursor(), take(글) — #900c 되돌리기 한 칸으로 바꾸기, seen() — #904 본 줄 모음 } (edit:true 로 render 한 칸만, 아니면 null)
//   render(…, { edit:true, onChange, onCursor(c|null), onLockedOut(lock) }) — onCursor = 내 커서 줄이 바뀔 때(줄 잠금 알림 'lk' 보낼 때) · onLockedOut = 내 줄을 남이 먼저 잡아 칸에서 빠졌을 때(작은 알림)
function editor(el) {
  const I = el && el._dsbEdit;
  return I ? { remote: I.remote, setLocks: I.setLocks, cursor: I.cursor, take: I.take, seen: () => I.seen } : null;
}
return { render, editor, parse: bdScParse, split: bdSbSplit, ttsLines: bdTtsGroups, mustItems, live };
})();
