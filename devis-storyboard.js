/* devis-storyboard.js — 만든 날짜 2026-11-13 · Devis 커밋 e90cb63
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
/* ---- 아이콘(app.js BD_ICONS) ---- */
const ICONS = {
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l2-3h4l2 3"/>',
  cart: '<path d="M3 4h2l2 11h11l2-8H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'
};
/* ---- tools/webboard/dsb_view.js ---- */
// 웹 보드용 '보기 전용' 그리기 — Devis app.js 의 bdScHtml · bdSbHtml · bdSbDirs · bdTtsDraw 와 같은 HTML 구조·클래스 이름(고치기 손잡이·＋ 단추·끌기만 뺌).
// build.py 가 앞에 sbcore.js 와 ICONS(아이콘 선 그림)를 이어 붙임. 이 파일은 손으로 고치는 원본 — 결과 파일(devis-storyboard.js)을 직접 고치지 말 것.
const PH_LABEL = '사진(PC에 있음)';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const icon = (name, sz) =>
  `<svg class="bdIc" viewBox="0 0 24 24"${sz ? ` width="${sz}" height="${sz}" style="vertical-align:-0.15em;flex:none"` : ''} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const ed = (v) => `<span class="bdEd">${esc(v)}</span>`; // Devis 의 bdEd(고치는 칸)와 같은 이름 — contenteditable 만 없음
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
    if (b.t === 'say') return `<div class="bdScSay${b.hook ? ' hook' : ''}${!b.text && ov && b.line === ov.end + 1 ? ' bdOvGap' : ''}"${at}${b.hook ? ' data-hook="1"' : ''}>${ed(b.text)}</div>`;
    if (b.t === 'ov') return b === ov ? ovHtml(b, at) + (b.beats[0] ? secH(1, b.beats[0], '') : '') : '';
    if (b.t === 'cut') {
      const k = ov && b.line > ov.end ? ++cutN + 1 : 0,
        bt = k && ov.beats[k - 1];
      return bt
        ? `<div class="bdScCut sec"${at} data-sec="${k}">${secH(k, bt, 'in')}</div>`
        : `<div class="bdScCut"${at}><span>${ed(b.text)}</span>${k ? `<span class="bdSecN">#${k}</span>` : ''}</div>`;
    }
    if (b.t === 'sub') return `<div class="bdScSubW"${at}><span class="bdScSub">${ed(b.text)}</span></div>`;
    if (b.t === 'dir')
      return `<div class="bdScDir bdSbDir"${at}><span class="bdSbPic${b.img ? '' : ' none'}">${icon('camera', 16)}${b.img ? `<small>${PH_LABEL}</small>` : ''}</span>${ed(b.text)}</div>`;
    if (b.t === 'shop')
      return `<div class="bdScShop"${at} data-shop="${esc(b.shop)}"><span class="bdScImg">${icon('cart')}</span><span class="bdScShopT"><small>${esc(b.shop)}</small><b>${ed(b.name)}</b><em>${ed(b.price)}</em></span></div>`;
    if (b.t === 'yt')
      return `<div class="bdScYt"${at}><span class="bdScAv"></span><span><small>${ed(b.name)} · 2시간 전</small>${ed(b.text)}<small class="bdScLk">${icon('heart')} 289 · 답글</small></span></div>`;
    if (b.t === 'dm') {
      const slot = b.photo || b.img ? `<div class="bdScPhoto">${b.img ? ph() : ''}${b.photo ? `<small>${esc(b.photo)}</small>` : ''}</div>` : '';
      const msgs = b.msgs
        .map(
          (m) =>
            `<div class="bdScMsg${BD_ME.test(m.who) ? ' me' : ''}${m.img || m.ph ? ' pic' : ''}" data-line="${m.line}" data-t="msg" data-who="${esc(m.who)}">${m.img || m.ph ? ph() : ed(m.text)}</div>`
        )
        .join('');
      return `<div class="bdScDm"${at} data-who="${esc(b.who)}"><div class="bdScDmH"><span class="bdScAv"></span><b>${ed(b.who)}</b><span class="sep"></span><small>DM</small></div>${slot}${msgs}</div>`;
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
      cs = cs.filter((c) => c.text.trim());
      if (!f.img && !f.text.trim() && !cs.length) return ''; // 빈 메모 = 안 그림(Devis 의 '＋ 화면'은 고치기 단추)
      const n = cs.length + 1,
        h = one(f)
          .replace('<div class="bdScDir bdSbDir"', `<div style="grid-template-rows:repeat(${n}, auto) 1fr" class="bdScDir bdSbDir"`)
          .replace('<span class="bdSbPic', `<span style="grid-row:1 / span ${n + 1}" class="bdSbPic`);
      return cs.length ? h.slice(0, -6) + cs.map((c) => `<div class="bdScDir bdSbDirC" data-line="${c.line}" data-t="dir">${ed(c.text)}</div>`).join('') + '</div>' : h;
    })
    .join('');
}

function sbHtml(body) {
  const bl = bdScParse(body),
    one = makeOne(bl),
    { pre, gs } = bdSbSplit(bl);
  return (
    pre.map(one).join('') +
    gs
      .map((g, i) => {
        const L = g.items.filter((b) => b.t !== 'dir'),
          D = g.items.filter((b) => b.t === 'dir'),
          at = g.cut ? g.cut.line + 1 : g.items.length ? g.items[0].line : 0;
        return (
          `${g.cut ? one(g.cut) : ''}<div class="bdSb"><div class="bdSbRow"><span class="bdSbN" aria-label="컷 ${i + 1}">${i + 1}</span>` +
          `<div class="bdSbCol bdSbL" data-sbat="${at}">${L.map(one).join('')}</div>` +
          `<div class="bdSbCol bdSbR" data-sbat="${at}">${dirsHtml(D, one)}</div></div></div>`
        );
      })
      .join('')
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

// 사용: DevisSB.render(el, body, { view: 'sb' | 'tts' | 'text', mustShots })
function render(el, body, opt) {
  const o = opt || {},
    v = o.view === 'tts' || o.view === 'text' ? o.view : 'sb',
    text = String(body == null ? '' : body);
  let inner;
  if (v === 'tts') inner = ttsHtml(text);
  else if (v === 'text') inner = `<div class="bdScView dsbText">${esc(text)}</div>`;
  else inner = `<div class="bdScView sb">${sbHtml(text)}</div>`;
  el.classList.add('dsb');
  el.innerHTML = `<div class="bdF bdScF" data-view="${v}">${inner}</div>${mustHtml(o.mustShots)}`;
  return el;
}

return { render, parse: bdScParse, split: bdSbSplit, ttsLines: bdTtsGroups, mustItems };
})();
