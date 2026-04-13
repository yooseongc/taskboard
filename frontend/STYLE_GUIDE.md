# Taskboard UI Style Guide

## Typography

| Token | Size | Usage |
|-------|------|-------|
| `--text-xs` | 12px | 메타정보, 배지, 타임스탬프 |
| `--text-sm` | 13px | 보조 텍스트, 라벨, 힌트 |
| `--text-base` | 14px | 본문 기본 (compact UI) |
| `--text-lg` | 16px | 섹션 제목 |
| `--text-xl` | 20px | 페이지 부제목 |
| `--text-2xl` | 24px | 페이지 제목 |

**Font Stack:**
- Latin: **Inter** (400/500/600/700)
- Korean: **Pretendard Variable** (auto-subset)
- Monospace: JetBrains Mono → Fira Code → Consolas
- 기본 font-size: 14px (compact UI에 적합)

**Weight Convention:**
- `font-bold` (700): 페이지 제목
- `font-semibold` (600): 카드 제목, 섹션 헤더
- `font-medium` (500): 버튼, 테이블 헤더
- normal (400): 본문

---

## Color System

모든 색상은 CSS custom property로 관리합니다. `index.css`의 `:root` 블록에서 정의됩니다.

### Brand
| Variable | Light | Dark | 용도 |
|----------|-------|------|------|
| `--color-primary` | #2563eb | #3b82f6 | 주 버튼, 링크, 포커스 |
| `--color-primary-hover` | #1d4ed8 | #2563eb | 주 버튼 호버 |
| `--color-primary-light` | #dbeafe | #1e3a5f | 선택된 항목 배경 |

### Surfaces
| Variable | Light | Dark | 용도 |
|----------|-------|------|------|
| `--color-bg` | #f9fafb | #0f172a | 페이지 배경 |
| `--color-surface` | #ffffff | #1e293b | 카드, 모달, 입력 배경 |
| `--color-surface-hover` | #f3f4f6 | #334155 | 호버 상태 |

### Text
| Variable | Light | Dark | 용도 |
|----------|-------|------|------|
| `--color-text` | #111827 | #f1f5f9 | 기본 텍스트 |
| `--color-text-secondary` | #6b7280 | #94a3b8 | 보조 텍스트 |
| `--color-text-muted` | #9ca3af | #64748b | 비활성/힌트 |

### Semantic
| Variable | Light | Dark | 용도 |
|----------|-------|------|------|
| `--color-success` | #16a34a | #22c55e | 성공, 활성 |
| `--color-warning` | #ca8a04 | #eab308 | 주의 |
| `--color-danger` | #dc2626 | #ef4444 | 에러, 삭제 |

---

## Spacing

Tailwind 기본 스케일을 따르되, 다음 규칙을 지킵니다:

| 용도 | 값 |
|------|-----|
| 아이템 내부 간격 | `p-2` ~ `p-3` |
| 카드 내부 | `p-4` ~ `p-5` |
| 페이지 패딩 | `px-6 py-8` |
| 섹션 간 | `mb-6` ~ `mb-8` |
| 요소 간 갭 | `gap-2` ~ `gap-4` |

---

## Border & Radius

| Token | Value | 용도 |
|-------|-------|------|
| `--radius-sm` | 4px | 배지, 태그 |
| `--radius-md` | 8px | 버튼(sm), 입력 |
| `--radius-lg` | 12px | 카드, 모달, 버튼(md/lg) |
| `--radius-xl` | 16px | 모달 외곽 |

---

## Shadow

| Token | 용도 |
|-------|------|
| `--shadow-sm` | 카드 기본 |
| `--shadow-md` | 카드 호버, 드롭다운 |
| `--shadow-lg` | 모달, 드로어 |

---

## Components

### Button Variants

| Variant | 용도 |
|---------|------|
| `primary` | 주요 액션 (생성, 저장) |
| `secondary` | 보조 액션 (취소, 필터) |
| `danger` | 삭제, 위험 액션 |
| `ghost` | 인라인 액션, 아이콘 버튼 |
| `success` | 긍정 액션 (템플릿 사용 등) |

### Badge
역할, 우선순위, 상태, 활성 여부 등 모든 인라인 태그는 `<Badge variant="…">` 한 곳으로 표준화되어 있습니다. 색상 팔레트는 아래 **Tag Palette** 절을 참조하세요. 도메인-↔-variant 매핑은 `theme/constants.ts`에서 일원화됩니다.

```tsx
<Badge variant="success">Active</Badge>
<Badge variant="warning">In Progress</Badge>
<Badge variant="critical">Urgent</Badge>

// 도메인 래퍼 (내부에서 tagClass로 resolve)
<Badge className={priorityClass(task.priority)}>{task.priority}</Badge>
<Badge className={statusClass(task.status)}>{task.status}</Badge>
<Badge className={roleClass(user.role)}>{user.role}</Badge>
```

### Modal
`ui/Modal.tsx` — title, body, footer 구조. backdrop은 `bg-black/30`.

### Card
`ui/Card.tsx` — `surface-raised` CSS 클래스 또는 Card 컴포넌트 사용.

### Input / Textarea / Select
`ui/Input.tsx` — 토큰 기반 스타일. label, hint 지원.

---

## Tag Palette

모든 인라인 태그(Badge)는 **8개의 semantic family** 중 하나로 분류됩니다. 값은 CSS custom property로 정의되고 `.dark` 오버라이드를 통해 자동으로 전환됩니다. 파일별로 Tailwind `dark:` 접두사를 반복하지 않고, `var(--tag-<family>-{bg,text})` 한 쌍만 참조합니다.

**Soft-chip 패턴**:
- Light: `bg = 100-tier` (연한 틴트) + `text = 700-tier` (채도 높은 톤)
- Dark: `bg = 900-tier` (어두운 톤) + `text = 200-tier` (밝은 톤)
- 모든 조합 WCAG AA (≥ 4.5:1 명도비) 이상

### Family matrix

| Family | 용도 | Light bg / text | Dark bg / text |
|---|---|---|---|
| `neutral` | 기본, 보관됨, 기본 부서/카테고리 | `gray-100` / `gray-700` | `gray-700` / `gray-300` |
| `info` | 정보, 열림 상태, 팀 어드민 | `blue-100` / `blue-700` | `blue-900` / `blue-200` |
| `success` | 완료, 활성, 낮은 우선순위 | `green-100` / `green-700` | `green-900` / `green-200` |
| `warning` | 진행중, 보통 우선순위, 주의 | `amber-100` / `amber-700` | `amber-900` / `amber-200` |
| `orange` | 높은 우선순위 | `orange-100` / `orange-700` | `orange-900` / `orange-200` |
| `danger` | 위험, 에러 | `red-100` / `red-700` | `red-900` / `red-200` |
| `critical` | 긴급, 최고관리자 | `red-200` / `red-800` | `red-800` / `red-100` |
| `accent` | 특수 역할(부서 관리자) | `violet-100` / `violet-700` | `violet-900` / `violet-200` |

### Domain mapping

| 도메인 값 | Variant | 근거 |
|---|---|---|
| Priority: `urgent` | `critical` | 최강 시각 강조 |
| Priority: `high` | `orange` | 산업 표준 gradient (red→orange→amber→green) |
| Priority: `medium` | `warning` | 중간 단계 |
| Priority: `low` | `success` | 완료 가능한 낮은 압력 |
| Status: `open` | `info` | 새로운 열린 태스크 |
| Status: `in_progress` | `warning` | 주의·진행중 |
| Status: `done` | `success` | 완료 |
| Status: `archived` | `neutral` | 저신호 |
| Role: `SystemAdmin` | `critical` | 최상위 접근권 |
| Role: `DepartmentAdmin` | `accent` | 확장 권한 |
| Role: `TeamAdmin` | `info` | 일반 관리 |
| Role: `Member` | `neutral` | 기본 |
| Role: `Viewer` | `neutral` | 읽기 전용 |
| Active/Inactive | `success` / `neutral` | inactive는 오류가 아니라 중립 상태 |

### 팔레트 사용 규칙

1. **새 태그가 필요하면** 먼저 8 family 중 어디에 속하는지 정한 뒤 `<Badge variant="…">`를 쓴다.
2. **도메인 문자열을 variant로 매핑할 곳은 `theme/constants.ts`에만 둔다** — `priorityClass(p)` 형태의 래퍼로 노출. 이렇게 하면 priority 재분류가 한 파일 수정으로 끝난다.
3. **CalendarView 같은 raster 표면** (react-big-calendar 등 CSS 변수를 못 읽는 캔버스류) 에는 `PRIORITY_EVENT_COLORS` 상수의 solid hex를 쓴다. 이 값은 `index.css`의 팔레트와 의미상 동기화되어야 한다.
4. **bg/text를 한쪽만 덮어쓰지 말 것.** 배경만 바꾸면 다크 모드에서 흰-흰 사고가 난다 — 항상 쌍으로.

---

## Sidebar

- 배경: `--color-sidebar-bg`
- 텍스트: `--color-sidebar-text`
- 활성: `--color-sidebar-text-active`
- 호버: `--color-sidebar-hover`
- 너비: `--sidebar-width` (14rem)

---

## Customization

### 커스텀 CSS
`:root`의 CSS 변수를 override하여 테마를 커스터마이징할 수 있습니다.

```css
/* 예: 보라색 테마 */
:root {
  --color-primary: #7c3aed;
  --color-primary-hover: #6d28d9;
  --color-primary-light: #ede9fe;
  --color-sidebar-bg: #2e1065;
}
```

### Accent Color
Settings 페이지에서 프리셋 또는 커스텀 hex 색상을 선택할 수 있습니다.
런타임에 `--color-primary` 변수를 동적으로 변경합니다.

---

## Dark Mode

`.dark` 클래스가 `<html>`에 추가되면 `:root`의 변수가 dark 값으로 override됩니다.
모든 컴포넌트는 CSS 변수를 참조하므로 자동으로 다크 모드가 적용됩니다.

Settings > Appearance에서 Light / Dark / System 선택 가능.
