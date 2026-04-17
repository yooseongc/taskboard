# Taskboard UI Style Guide

> 최종 갱신: 2026-04-18

## Design ethos

**Warm minimalism, soft surfaces, Korean-first typography.**

Notion 계열의 "warm minimalism" — 따뜻한 off-white 배경 + charcoal-brown 텍스트 + 반투명 taupe 보더 + 최소한의 드롭 섀도 — 를 전체 UI의 기조로 삼는다. 단, 한국어 비중이 높아 제목용 serif 폰트는 도입하지 않고 기존 Pretendard Variable 를 그대로 쓴다. "Notion 느낌" 은 세리프가 아닌 **색·간격·radius·섀도**에서 만든다.

모든 시각 속성은 CSS custom property 로 관리되고, `.dark` 클래스 하나의 토글로 light↔dark 가 전환된다. 컴포넌트는 hex 값을 직접 쓰지 않고 `var(--color-*)` 를 참조한다 (CalendarView 의 이벤트 색처럼 canvas 기반 라이브러리에 넘겨야 하는 경우만 예외).

---

## Typography

| Token | Size | Usage |
|---|---|---|
| `--text-xs` | 12px | 메타정보, 배지, 타임스탬프 |
| `--text-sm` | 13px | 보조 텍스트, 라벨, 힌트 |
| `--text-base` | 14px | 본문 기본 (compact UI) |
| `--text-lg` | 16px | 섹션 제목 |
| `--text-xl` | 20px | 페이지 부제목 |
| `--text-2xl` | 24px | 페이지 제목 |

**Font stack (변경 없음)**:
- Sans: **Pretendard Variable** → Inter → system
- Mono: JetBrains Mono → Fira Code → Consolas
- Base font-size: 14px (compact UI)

**Weight convention**:
- `font-bold` (700): 페이지 제목(h1)
- `font-semibold` (600): 카드 제목, 섹션 헤더(h2)
- `font-medium` (500): 버튼, 테이블 헤더
- normal (400): 본문

**제목 레이아웃 규약**:
- h1 (페이지 타이틀): `text-2xl md:text-3xl font-bold tracking-tight`
- h2 (섹션): `text-xl font-semibold tracking-tight`
- 본문 내 h3 이하는 기존 sans 유지

**Serif 도입 안 함** — 한국어 렌더링 품질·자모 간격이 serif 조합에서 떨어지는 문제. "Notion 같은 따뜻함" 은 색·radius·섀도로 달성.

---

## Color tokens

모든 색상은 `frontend/src/index.css` 의 `:root` / `.dark` 블록에 정의. 다크모드는 `<html>` 에 `.dark` 클래스가 붙으면 자동 전환.

### Brand
| Variable | Light | Dark |
|---|---|---|
| `--color-primary` | `#2563eb` | `#3b82f6` |
| `--color-primary-hover` | `#1d4ed8` | `#2563eb` |
| `--color-primary-light` | `#dbeafe` | `#1e3a5f` |
| `--color-primary-text` | `#1e40af` | `#93c5fd` |

### Surfaces (warm off-white / warm near-black)
| Variable | Light | Dark |
|---|---|---|
| `--color-bg` | `#f7f6f3` | `#191918` |
| `--color-surface` | `#ffffff` | `#252523` |
| `--color-surface-hover` | `#f1efec` | `#2f2f2d` |
| `--color-surface-active` | `#ebeae4` | `#373735` |
| `--color-surface-raised` | `#ffffff` | `#2f2f2d` |

### Sidebar (light warm — 이전 dark 에서 전환)
| Variable | Light | Dark |
|---|---|---|
| `--color-sidebar-bg` | `#f7f6f3` | `#202020` |
| `--color-sidebar-text` | `#37352f` | `#c4c4c2` |
| `--color-sidebar-text-active` | `#37352f` | `#f1f1ef` |
| `--color-sidebar-hover` | `#efece7` | `#2d2d2a` |
| `--color-sidebar-border` | `rgba(55,53,47,0.09)` | `rgba(255,255,252,0.09)` |

### Text (warm charcoal)
| Variable | Light | Dark |
|---|---|---|
| `--color-text` | `#37352f` | `#d4d4d4` |
| `--color-text-secondary` | `#6f6e69` | `#a3a29e` |
| `--color-text-muted` | `#9b9a97` | `#787774` |
| `--color-text-inverse` | `#ffffff` | `#191918` |

### Borders (soft translucent)
| Variable | Light | Dark |
|---|---|---|
| `--color-border` | `rgba(55,53,47,0.12)` | `rgba(255,255,252,0.09)` |
| `--color-border-light` | `rgba(55,53,47,0.065)` | `rgba(255,255,252,0.055)` |
| `--color-border-focus` | `#2563eb` | `#3b82f6` |

### Semantic
| Variable | Light | Dark |
|---|---|---|
| `--color-success` | `#16a34a` | `#22c55e` |
| `--color-warning` | `#ca8a04` | `#eab308` |
| `--color-danger` | `#dc2626` | `#ef4444` |
| `--color-info` | `#2563eb` | `#3b82f6` |

---

## Spacing

Tailwind 기본 스케일을 따르되 반응형 패딩에는 아래 패턴을 기본으로:

| 용도 | 모바일 (<md) | 데스크톱 (≥md) |
|---|---|---|
| 페이지 수평 패딩 | `px-4` | `px-6 lg:px-8` |
| 페이지 수직 패딩 | `py-6` | `py-8` |
| 카드 내부 | `p-3` | `p-4` |
| 요소 간 갭 | `gap-2 md:gap-3` | |

Gap scale `gap-2` ~ `gap-4` 내에서 통일.

---

## Border & Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 3px | 배지, 태그 |
| `--radius-md` | 6px | 버튼(sm), 입력 |
| `--radius-lg` | 8px | 카드, 모달, 버튼(md/lg) |
| `--radius-xl` | 12px | 모달 외곽 |

이전(4/8/12/16px) 대비 1~4px 씩 타이트. Notion 의 차분한 각을 모사.

---

## Shadow

| Token | Light | Dark |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(15,15,15,0.04)` | `0 1px 2px rgba(0,0,0,0.25)` |
| `--shadow-md` | `0 6px 14px rgba(15,15,15,0.08)` | `0 6px 14px rgba(0,0,0,0.35)` |
| `--shadow-lg` | `0 12px 32px rgba(15,15,15,0.14)` | `0 12px 32px rgba(0,0,0,0.5)` |

대부분의 surface 는 **섀도 없이 보더만** 으로 분리. 팝오버·모달만 shadow-md/lg.

---

## Responsive breakpoints

| Breakpoint | Min width | 사용 기준 |
|---|---|---|
| `sm` | 640px | 카드 그리드 2-col 전환 |
| `md` | 768px | **사이드바 등장 지점**. 햄버거는 `md:hidden`. 테이블·칸반은 이 breakpoint 부터 full-width. |
| `lg` | 1024px | 3-col 카드 그리드, 데스크톱 레이아웃 |
| `xl` | 1280px | 테이블 모든 열 무 스크롤 (커스텀 필드 많으면 예외) |

### 모바일 사이드바 — Off-canvas drawer

- `md` 미만 에서는 사이드바가 `position: fixed; z-40` 로 덮여있고 기본적으로 숨김.
- 상단 헤더의 햄버거 버튼(≡)이 `setSidebarOpen(true)` 로 열기.
- `bg-black/40` 백드롭 클릭·ESC·라우트 변경 시 자동 닫힘.
- 패널 폭은 `w-56` (기본 사이드바 폭) 을 유지하고 모바일에서도 `max-w-[80vw]` 이내.

### 반응형 헤더·패딩

- 페이지 타이틀: `text-2xl md:text-3xl`.
- 페이지 패딩: `px-4 md:px-6 py-6 md:py-8` 패턴을 `BoardListPage`, `TemplatesPage`, `BoardViewPage` 에 적용.

---

## Horizontal overflow (가로 스크롤)

콘텐츠(컬럼·필드)가 많을 때 **가로 스크롤** 로 해결. 세로 스크롤에 위임하지 않는다.

### 칸반 (Board view)

- 컨테이너: `<div className="flex-1 overflow-x-auto p-4">` — `BoardViewPage.tsx:815`
- 각 컬럼: `w-64 md:w-72 flex-shrink-0` — 좁은 화면에서도 읽기 편한 최소 폭 유지. 다수 컬럼일 때 자연스럽게 가로 스크롤.

### 테이블 (Table view)

- Wrapper: `<div className="overflow-x-auto rounded-lg" style={{border:…}}>` — `TableView.tsx:821`
- `<table>` 은 `w-full` 로 시작하되, 커스텀 필드로 행 폭이 커지면 자연 확장.
- **Sticky first column**: 첫 번째 표시 컬럼(보통 Title) 의 `<th>` / `<td>` 가 스크롤 중에도 좌측에 고정.
  - `position: sticky; left: 0` (bulk-select 가 있으면 `left: 32`)
  - `z-index: 2` (header), `z-index: 1` (body cell)
  - 투명 배경 금지 — `background-color: var(--color-surface-hover|surface)`
  - 오른쪽 경계: `box-shadow: 2px 0 4px rgba(0, 0, 0, 0.04)` 로 스크롤 중이라는 시각 단서.
- **Sticky footer**: `<tfoot className="sticky bottom-0">` — 집계 결과가 세로 스크롤에도 항상 보이게.
- 컬럼 resize, 정렬 아이콘, sticky 를 같은 셀에 쌓았을 때 `resize handle` 이 sticky 셀 오른쪽 경계보다 앞에 와야 드래그 가능.

### 캘린더

`react-big-calendar` 자체가 responsive. 모바일에서 toolbar 레이아웃만 `flex-wrap` 으로 스택. 가로 스크롤 불필요.

---

## Components

### Button

`components/ui/Button.tsx`. Variants:

| Variant | 용도 |
|---|---|
| `primary` | 주요 액션 (생성, 저장) |
| `secondary` | 보조 액션 (취소, 필터) |
| `danger` | 삭제, 위험 액션 |
| `ghost` | 인라인 액션, 아이콘 버튼 |
| `success` | 긍정 액션 (템플릿 사용 등) |

모든 variant 는 `var(--color-*)` 토큰 참조 — hex 하드코드 금지.

### Modal

`components/ui/Modal.tsx`. backdrop `rgba(15,15,15,0.4)`, panel `--radius-xl` + `--shadow-lg`.

### Card

`components/ui/Card.tsx`. `surface-raised` 유틸 또는 `Card` 컴포넌트. 기본 보더 `--color-border`, 섀도 없음(raised 변형만 `--shadow-sm`).

### Badge

모든 인라인 태그는 `<Badge variant="…">` 로 일원화. 변종은 `theme/constants.ts` 의 8-family (Tag Palette) 중 하나.

```tsx
<Badge variant="success">Active</Badge>
<Badge variant="critical">Urgent</Badge>
<Badge className={priorityClass(task.priority)}>{task.priority}</Badge>
```

### Input / Select / Textarea

`components/ui/Input.tsx` — 토큰 기반. 보더 `--color-border`, focus `--color-border-focus`, radius `--radius-md`.

### Command palette

`components/CommandPalette.tsx` — Cmd/Ctrl+K. 토큰 기반 팝업 (`--shadow-lg`, `--radius-lg`).

---

## Tag Palette — 8 semantic families

값은 `index.css` 의 `--tag-*-{bg,text}` 로 정의되고 `.dark` 오버라이드로 자동 전환.

**Soft-chip 패턴**:
- Light: `bg = 100-tier` (연한 틴트) + `text = 700-tier`
- Dark: `bg = 900-tier` + `text = 200-tier`
- 모든 조합 WCAG AA (≥ 4.5:1)

| Family | 용도 |
|---|---|
| `neutral` | 기본, 보관됨 |
| `info` | 정보, 열림 상태 |
| `success` | 완료, 활성, 낮은 우선순위 |
| `warning` | 진행중, 보통 우선순위 |
| `orange` | 높은 우선순위 |
| `danger` | 위험, 에러 |
| `critical` | 긴급, 최고관리자 |
| `accent` | 부서 관리자 등 특수 역할 |

### Domain mapping (theme/constants.ts 에서 일원화)

| 도메인 값 | Variant |
|---|---|
| Priority: `urgent` | `critical` |
| Priority: `high` | `orange` |
| Priority: `medium` | `warning` |
| Priority: `low` | `success` |
| Status: `open` | `info` |
| Status: `in_progress` | `warning` |
| Status: `done` | `success` |
| Status: `archived` | `neutral` |
| Role: `SystemAdmin` | `critical` |
| Role: `DepartmentAdmin` | `accent` |
| Role: `TeamAdmin` | `info` |
| Role: `Member` / `Viewer` | `neutral` |

### 팔레트 사용 규칙

1. 새 태그는 먼저 8-family 중 어디에 속할지 정하고 `<Badge variant="…">`.
2. 도메인 문자열을 variant 로 매핑하는 곳은 `theme/constants.ts` 한 파일. `priorityClass(p)` 형태의 래퍼로 노출.
3. CalendarView 처럼 CSS 변수를 못 읽는 canvas 표면은 `PRIORITY_EVENT_COLORS` 상수의 solid hex. 이 값은 `index.css` 팔레트와 의미상 동기화.
4. bg/text 한쪽만 덮어쓰지 말 것 — 다크모드에서 흰-흰 사고 방지.

---

## Customization

### Accent color

Settings → Appearance 에서 프리셋 또는 커스텀 hex 를 선택하면 런타임에 `--color-primary` 가 교체됨. `AccentColorSync` 컴포넌트가 처리.

### 커스텀 CSS 주입

`:root` 오버라이드로 테마 변형 가능:

```css
:root {
  --color-primary: #7c3aed;
  --color-primary-hover: #6d28d9;
  --color-primary-light: #ede9fe;
}
```

---

## Dark mode

`<html>` 에 `.dark` 클래스가 붙으면 `:root` 의 변수가 dark 값으로 override. 모든 컴포넌트가 CSS 변수를 참조하므로 추가 분기 없이 자동 반영.

Settings > Appearance 에서 Light / Dark / System 선택 가능. OS 테마 변경 감지는 `ThemeProvider.tsx` 의 `matchMedia` 훅이 담당.

---

## 참조

- `frontend/src/index.css:17-190` — 전체 토큰 정의
- `frontend/src/theme/constants.ts` — 도메인 ↔ variant 매핑
- `frontend/src/theme/ThemeProvider.tsx` — 라이트/다크 토글
- `frontend/src/components/Layout.tsx` — 사이드바 + 모바일 드로어
- `frontend/src/components/TableView.tsx:820-864` — 테이블 sticky first column + sticky footer
- `frontend/src/pages/BoardViewPage.tsx:815` — 칸반 가로 스크롤
