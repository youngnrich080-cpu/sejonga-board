// #898 '누가 보는 중 · 고치는 중' — 순수 함수만(화면·소켓·전역 상태 없음). Devis(presence898.js)와 웹 보드가 같은 규칙을 쓰려고 따로 뗌 — 고칠 때는 여기서만.
// 채널 = 'board:<방 id>'(Supabase Realtime Presence — 표에 아무것도 안 씀). 한 사람(한 탭) 상태 = { who, dev, sid, typing, at }
//   who = 보드가 쓰는 이름('현재'·'세종' 등) · dev = 'Devis' | '폰' | '웹' · sid = 보고 있는 대본 id(없으면 null) · typing = 최근 3초 안에 쳤나 · at = 보낸 시각(ms)
// 받는 쪽은 남이 보낸 상태에 seen(= 내가 그걸 받은 시각, ms)을 붙여서 넘김 — 컴퓨터 시계가 달라도 '오래 소식 없는 사람'을 가려내려고(at 은 참고만).
const PR_STALE = 180000; // 3분 동안 아무 소식(들어옴·바뀜·1분마다 다시 알림)이 없으면 끊긴 사람으로 보고 안 보임
const PR_TYPE = 8000; // '고치는 중'은 마지막으로 받은 지 8초 안일 때만(치는 동안 5초마다 다시 알려 줌) — 끊긴 채 '치는 중'으로 남지 않게
const PR_DEVS = ['폰', '웹', 'Devis']; // 한 사람이 여러 곳이면 이 차례로 '폰·Devis'
const PR_COLORS = ['#C2410C', '#0F766E', '#6D28D9', '#B91C1C', '#1D4ED8', '#4D7C0F', '#A21CAF', '#0E7490']; // 흰 글자 대비 4.5 이상 — 사람마다 이름으로 고정
function prColor(who) {
  let h = 0;
  for (const ch of String(who || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PR_COLORS[h % PR_COLORS.length];
}
// metas = 남의 상태 줄 목록(내 것 포함이어도 me 이름은 뺌) · sid = 볼 대본 · 반환 = [{who, devs, typing}] (사람 한 명 = 한 줄, 이름 가나다 차례)
function prViewers(metas, me, sid, now) {
  const by = new Map();
  if (!sid) return [];
  for (const m of metas || []) {
    if (!m || !m.who || m.who === me || m.sid !== sid) continue;
    const age = now - (m.seen ?? m.at ?? now);
    if (age > PR_STALE) continue;
    let p = by.get(m.who);
    if (!p) by.set(m.who, (p = { who: m.who, devs: [], typing: false }));
    const d = m.dev || 'Devis';
    if (!p.devs.includes(d)) p.devs.push(d);
    if (m.typing && age < PR_TYPE) p.typing = true;
  }
  for (const p of by.values()) p.devs.sort((a, b) => PR_DEVS.indexOf(a) - PR_DEVS.indexOf(b));
  return [...by.values()].sort((a, b) => a.who.localeCompare(b.who, 'ko'));
}
const prDevTxt = (devs) => (devs || []).join('·');
// 마우스 올릴 때: '세종 · 폰에서 보는 중' / '세종 · 폰·Devis에서 고치는 중'
const prTip = (v) => `${v.who} · ${prDevTxt(v.devs)}에서 ${v.typing ? '고치는' : '보는'} 중`;
// 열린 대본 줄: '세종 보는 중' / '세종 고치는 중…'
const prBarTxt = (v) => `${v.who} ${v.typing ? '고치는 중…' : '보는 중'}`;
