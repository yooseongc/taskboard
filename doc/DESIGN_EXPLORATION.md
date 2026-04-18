# DESIGN_EXPLORATION.md — UI 개선 탐색 (frontend-design pre-pass)

이 문서는 `frontend-design` 스킬을 실제 코드로 돌리기 **전** 단계의 관찰/가설 모음이다. 각 타겟에 대해 현 상태 요약, 구체 문제점, 3~4개 방향 제안, 채택 체크리스트를 담는다. 방향이 정해지면 해당 제안을 기반으로 `frontend-design` 스킬을 실행해 실 코드를 생성하고 별도 PR 로 반영한다.

현재 디자인 어법: Notion-ish warm minimalism(`#37352f` body · warm off-white surface · `--color-primary` 기본 blue · 토큰 전부 CSS 변수). 리뷰 기준은 이 결을 유지하는 것.

---

## 타겟 1 — 캘린더 뷰 리디자인 (Section 2 기반 확장)

### 현재 (Section 2 마감 상태)

- react-big-calendar 기본 toolbar 를 커스텀 `CalendarToolbar` 로 교체 (Today/←/→/Month/Week)
- `.rbc-*` CSS 를 `var(--color-*)` 토큰으로 repaint → 다크모드 flip OK
- GroupBy 드롭다운 제거 → 이벤트 색은 priority 팔레트 고정
- 이벤트 블록: 불투명도 0.9, white 텍스트, 짧은 라벨

### 문제점 (Section 2 로 다 잡지 못한 것)

1. **이벤트 블록이 아직 "광고 배너" 같음** — saturated fill + 흰 텍스트라 시선을 강하게 끌지만 목록 가독성이 낮아짐. 특히 월 뷰에서 한 셀에 이벤트 4+ 개면 벽처럼 보임.
2. **Month 셀의 날짜 숫자가 작음** — 현재 `.rbc-date-cell` `6px 4px` 인데 hover/today 표시가 눈에 덜 띔.
3. **Week 뷰의 time gutter 가 기계적** — 숫자만 빽빽. 작업 밀도 힌트 없음.
4. **Off-range 일 (이전/다음 달) 이 flat surface-hover 라 구분이 약함** — 토큰으로 교정했지만 라이트 모드에선 거의 안 보임.
5. **오늘 표시가 옅음** — `color-mix primary 12%` 로는 다크모드에서 놓치기 쉬움.

### 방향 제안

**A. 이벤트 칩 "fading chip" 재설계 (권장)**
- 현 saturated block → 배경 `primary`+15%, 왼쪽 3px 컬러 스트립, 본문 `--color-text`.
- 월 뷰에 4개 이상이면 "+N 더보기"가 이미 있지만 칩 높이를 18→20px 로 키워 타이밍 힌트(시각, 아이콘) 수용.
- 장점: Notion/Linear 결. 밀도↑ 가독성↑. 단점: priority 구분이 약해짐 → 색 스트립이 이를 보완.

**B. "heatmap" 모드 추가**
- Toolbar 에 Month/Week 다음 3번째 버튼 "Density" 로 전환 → 셀 배경을 그 날의 이벤트 수에 비례해 `primary` opacity 로 음영.
- 장점: 바쁜 구간 즉시 확인. 단점: 개별 이벤트는 여전히 필요 → Month 와 중복감.

**C. Week 뷰 전면 재작성 (scope 큼)**
- `react-big-calendar`의 week view 대신 자체 구현(7열 grid). 30분 단위 + 현 시각 indicator 두텁게 + 드래그로 task 시간 조정.
- 장점: 다른 뷰와 디자인 언어 통일. 단점: 구현비용 큼.

### 채택 체크리스트

- [ ] A 진행 여부 (기본 추천) — 칩 스타일만 바꿔도 큰 개선
- [ ] B 부가 여부 — density 토글이 실제로 쓰일 지 확인 필요
- [ ] C 는 별도 스프린트 — 이번엔 보류

---

## 타겟 2 — 알림 페이지 + 벨 팝오버 (Section 4 기반 polish)

### 현재 (Section 4b 마감 상태)

- 헤더 우측 `NotificationBell` — 벨 아이콘 + 빨간 unread 뱃지
- 클릭 시 320px 팝오버: "안읽음" 상단 헤더 + 최근 10건 + "모두 보기" 링크
- 각 row 는 1~2줄 한국어 요약 + 상대시간 + 보드명
- `/notifications` 페이지: 탭(안읽음/전체) + 리스트 + "모두 읽음" 버튼

### 문제점

1. **row 가 정보만 나열 — 계층이 없다** — 누가/무엇을/어디에 가 같은 크기. 시선이 어디로 가야 할지 모름.
2. **kind 뱃지는 뒤에 박혀 있어 스캔이 어려움** — deadline overdue 가 critical 인데 회색 일반 뱃지.
3. **unread ↔ read 의 시각 차이가 왼쪽 2px 점 하나** — bold 만 차이. 부족.
4. **벨 팝오버에 action 이 "열기"뿐** — row 에서 바로 읽음/무시 처리 불가.
5. **빈 상태가 텍스트 한 줄** — "알림이 없어요" 만 있어 썰렁.

### 방향 제안

**A. row 의 3단 계층화 (권장)**
- 왼쪽 `Avatar`(actor) 또는 kind 아이콘 → 중앙 본문(1줄 요약 + 2줄 보드/task 컨텍스트) → 우측 상대시간 + `⋯` 메뉴.
- `⋯`: "읽음 처리", "이 보드 알림 끄기"(미래).
- kind 별 leading 아이콘: deadline → 시계, mention → @, assigned → 손, board_activity → 편집.
- 장점: 한눈에 "누가-무엇을" 파싱. 빠른 액션 접근.

**B. deadline_overdue 의 시각적 urgency**
- row 왼쪽에 2px `--color-danger` 바, 제목 `var(--color-danger)`.
- 배지는 채움(filled) 대신 outline 으로 통일 — 색은 kind 별로만 구분.

**C. 빈 상태 일러스트**
- 간단한 SVG (벨 위에 zzz 표시) + "여기 알림이 쌓여요" copy. 토큰 색만 써서 light/dark 전환 OK.

**D. 팝오버를 "full-height drawer" 로**
- 벨 클릭 시 드로어가 오른쪽에서 슬라이드 (width 360px). 현재 320px popover 와 같은 정보지만 더 많은 row 수용, drag/swipe 로 스와이프 동작 가능.
- 단점: 모바일에선 좋지만 데스크탑에선 현 popover 가 더 가벼움.

### 채택 체크리스트

- [ ] A (3단 row) — 가장 큰 영향. 우선 추천.
- [ ] B (danger 시각 긴급도) — A 와 함께 묶어서.
- [ ] C (빈 상태) — 1~2시간 작업.
- [ ] D (drawer) — 모바일 우선시할 때만.

---

## 타겟 3 — 보드 Overview (`/`) 리디자인

### 현재

- `BoardListPage` (읽지는 않음) — `GET /api/users/me/boards` 의 4-bucket 을 선형으로 나열한 것으로 추정.
- 사이드바에도 같은 4-bucket 이 있음 → 메인 페이지와 중복감.

### 문제점 (가설)

1. **홈이 곧 "보드 리스트"** — 정보 구조상 사이드바와 겹침.
2. **히어로/대시보드가 없음** — 오늘 할 일/임박한 기한/최근 활동이 보드 단위로만 묶여 있음.
3. **보드 카드가 단순 타이틀** — 미리보기(칸반 축소판/ 최근 활동)가 없어서 "어느 보드인지" 식별에 클릭 한 번 더 필요.

### 방향 제안

**A. Today-first 대시보드 (권장)**
- 페이지 상단 3칸:
  1. "오늘 할 일" — 내가 assignee 인 `due_date <= now+24h AND status != done`
  2. "임박 알림" — 최근 unread `deadline_*` / `assigned`
  3. "최근 활동" — 내가 멤버인 보드의 최근 activity 5건
- 아래에 기존 4-bucket 보드 그리드.
- 장점: 홈을 열었을 때 "다음 액션"이 즉시 보임. Section 4 알림 인프라 재사용.

**B. 보드 카드 리디자인 — 미리보기 포함**
- 각 카드에: 제목 + 컬럼 수 + task 수 + 상위 3명 assignee 아바타 스택 + 최근 update 상대시간.
- 카드 hover 시 primary 테두리 강조 + 작은 칸반 미리보기(컬럼 3개 축소).

**C. 4-bucket 의 공간 최적화**
- 현재 세로 스택이면 viewport 가 낭비됨. 2열 grid + 각 bucket 은 작은 list (접을 수 있는 `<details>`).

### 채택 체크리스트

- [ ] A (대시보드 전환) — 큰 임팩트. 별도 backend 변경은 불필요(기존 API 재사용)
- [ ] B (카드 미리보기) — 중간 영향. `list_my_boards` 응답에 요약 필드 추가 필요.
- [ ] C (그리드 조밀화) — 1~2시간 작업.

---

## frontend-design 스킬 연동 가이드

각 타겟의 채택 체크에 맞춰 스킬을 호출할 때는 다음을 포함해 프롬프트를 만든다:

1. **기존 토큰 제약**: "모든 색/보더/그림자는 `var(--color-*)` 만 사용. Tailwind 하드코드 금지 (`bg-blue-500` 등)."
2. **라이브러리 제약**: "react-big-calendar / @hello-pangea/dnd 는 이미 있음. 그 외 신규 npm 의존은 금지."
3. **컴포넌트 범위**: 특정 파일만 건드리도록. 예: "`CalendarView.tsx` 의 event pill + CalendarToolbar 만 재디자인".
4. **토큰 팔레트 참조**: `doc/STYLE_GUIDE.md` + `frontend/src/index.css` 를 명시적으로 읽으라고 지시.

> 이 문서는 살아있는 초안이다. 채택/폐기 여부가 정해진 항목은 체크박스를 채우거나 삭제한다.
