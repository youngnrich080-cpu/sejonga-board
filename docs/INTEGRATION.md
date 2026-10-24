# 세종아 보드 — 쇼츠 편집기 연동 명세

세종아 대본·진행 보드(https://youngnrich080-cpu.github.io/sejonga-board/)의 데이터를 쇼츠 편집기에서 읽고, 진행 단계를 갱신하기 위한 문서다.

## 1. 구조 한눈에

```
[보드 웹(GitHub Pages)] ──┐
                          ├──> Supabase (Postgres + Auth + REST/Realtime)
[쇼츠 편집기]  ───────────┘      테이블: public.scripts
```

- 보드와 편집기는 **같은 테이블 하나**를 함께 쓴다. 서버는 따로 없다.
- Supabase 프로젝트: `https://ndyygluwlfeqibpdhnjk.supabase.co` (리전 Seoul)
- 클라이언트 키(publishable, 공개 가능): `sb_publishable_RuA_IM5-e9UO5PBdktLYqw_R4qnfryP`
- 계정·비밀번호는 이 문서에 없다. 현재(운영자)에게 따로 받는다.

## 2. 업무 흐름과 단계(stage)

대본 1개가 아래 순서로 진행된다. `stage`는 **마지막으로 완료 체크된 단계**다.

| stage | 의미(완료된 것) | 진행도 | 다음 할 일 | 다음 담당 |
|---|---|---|---|---|
| 0 | 대본 작성 중 | 0% | 대본 완성 | `author` 값 |
| 1 | ㄱ 대본 완성 | 25% | ㄴ 촬영 · 원본 클라우드 공유 | 세종 |
| 2 | ㄴ 촬영 완료 | 50% | ㄷ TTS 나레이션 · 컷편집 · 자막 | 현재 |
| 3 | ㄷ 1차 편집 완료 | 75% | ㄹ 효과음 · 자막효과 · 검수 · 드라이브 업로드 | 세종 |
| 4 | ㄹ 최종 완료 | 95% | 플랫폼 업로드 | 현재 |
| 5 | 업로드 완료 | 100% | 없음 | 없음 |

- 진행도와 담당은 **DB에 저장하지 않고 `stage`로 계산**한다. 위 표를 그대로 코드 상수로 두면 된다.
- 담당자 표시 색: 세종 `#0FB981`(초록), 현재 `#2F6FEB`(파랑).
- 편집기가 주로 다루는 건 **stage 2 → 3(현재의 1차 편집 완료)**, 필요하면 **3 → 4(세종의 최종 완료)**다.

## 3. 테이블 `public.scripts`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | 대본 ID |
| title | text | 제목 |
| plan | text | 기획(예: A 식비 챌린지) |
| product | text | 링크 걸 제품 |
| author | text | `'현재'` 또는 `'세종'` |
| body | text | 대본 원문(TTS 나레이션 원고) |
| must_shots | text | 꼭 찍어야 할 장면(줄바꿈 구분 자유 텍스트) |
| memo | text | 메모 |
| stage | smallint | 0~5, 위 표 |
| stage_log | jsonb | 단계별 완료 시각. 예: `{"1":"2026-10-22T10:00:00Z","2":"..."}` |
| created_at | timestamptz | 생성 시각 |
| updated_at | timestamptz | 수정 시각(트리거로 자동 갱신) |

### 쓰기 규칙 (보드와 반드시 맞출 것)
1. 단계는 **한 칸씩만** 올린다(`stage = stage + 1`). 건너뛰지 않는다.
2. 올릴 때 `stage_log`에 `"<새 stage>": ISO 시각`을 **추가**한다(기존 키 유지).
3. 되돌릴 때는 `stage - 1`, `stage_log`에서 그 키를 지운다.
4. 기존 컬럼의 이름·의미를 바꾸지 않는다. 필요하면 **컬럼을 새로 추가**한다(아래 5번).

## 4. 인증·권한

- RLS(행 수준 보안)로 **로그인한 허용 이메일만** 읽기·쓰기 가능하다. 지금 허용 이메일은 보드 공용 계정 하나다.
- 편집기도 Supabase Auth로 로그인해서 쓰는 걸 권장한다(`signInWithPassword`). 로그인 없이(anon 키만으로) 요청하면 빈 결과가 온다.
- **권장:** 편집기 전용 계정을 따로 만들고 허용 목록에 추가한다. 그래야 기록이 구분되고, 공용 비밀번호를 편집기에 넣지 않아도 된다. 운영자가 아래 SQL을 실행하면 된다(이메일만 바꿔서).

```sql
drop policy "team only" on public.scripts;
create policy "team only" on public.scripts
  for all to authenticated
  using ((auth.jwt() ->> 'email') in ('sejongahhh@gmail.com','<편집기 계정 이메일>'))
  with check ((auth.jwt() ->> 'email') in ('sejongahhh@gmail.com','<편집기 계정 이메일>'));
```

- `service_role`(secret) 키는 **클라이언트 앱에 절대 넣지 않는다.** 서버가 있는 구조일 때만 서버 쪽에서 쓴다.

## 5. 연동 방식 제안

### 읽기 (할 일 목록)
```js
import { createClient } from '@supabase/supabase-js'
const sb = createClient(URL, PUBLISHABLE_KEY)
await sb.auth.signInWithPassword({ email, password })

// 현재(1차 편집) 차례인 대본
const { data } = await sb.from('scripts')
  .select('id,title,plan,product,body,must_shots,stage,updated_at')
  .eq('stage', 2)
  .order('updated_at', { ascending: false })
```
REST로 직접 부를 수도 있다: `GET /rest/v1/scripts?stage=eq.2&select=...` + 헤더 `apikey`, `Authorization: Bearer <로그인 access token>`.

### 쓰기 (단계 완료)
```js
const log = { ...row.stage_log, [row.stage + 1]: new Date().toISOString() }
await sb.from('scripts').update({ stage: row.stage + 1, stage_log: log })
  .eq('id', row.id).eq('stage', row.stage)   // 동시 수정 방지: 그사이 바뀌었으면 0건 업데이트
```

### 실시간 반영 (선택)
보드에서 세종이 체크하면 편집기에 바로 뜨게 하려면 Realtime을 켠다. 운영자가 한 번 실행:
```sql
alter publication supabase_realtime add table public.scripts;
```
```js
sb.channel('scripts').on('postgres_changes',
  { event: '*', schema: 'public', table: 'scripts' }, payload => refresh()).subscribe()
```

### 편집기 화면에서 권장하는 것
- '내 차례' 목록: stage 2(1차 편집할 것)를 위에 노출.
- 대본 열기: `body`(나레이션 원고)와 `must_shots`(필요 컷)를 편집 화면 옆에 표시 → TTS 생성·컷 배치에 바로 사용.
- 내보내기(1차 편집 완료) 시 "ㄷ 완료 체크" 버튼 → stage 2→3.

### 필요하면 추가할 컬럼 (운영자와 합의 후 SQL로 추가)
- `editor_project_id text` — 편집기 프로젝트와 대본 연결
- `raw_footage_url text` — ㄴ에서 공유한 원본 위치
- `export_url text` — 1차·최종 결과물 위치
```sql
alter table public.scripts
  add column editor_project_id text, add column raw_footage_url text, add column export_url text;
```
보드는 모르는 컬럼을 무시하므로 추가해도 보드는 깨지지 않는다.

## 6. 운영 메모
- DB 구조 변경(SQL)은 운영자(현재)가 Supabase SQL Editor에서 실행한다.
- 보드 코드: 이 저장소의 `index.html` (단일 파일). 단계 정의는 `STAGES` 상수와 위 표가 같아야 한다.
