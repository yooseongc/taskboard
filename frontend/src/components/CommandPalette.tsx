import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBoards } from '../api/boards';
import { useUsers } from '../api/users';
import { useTemplates } from '../api/templates';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useTheme } from '../theme/ThemeProvider';

interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  action: () => void;
  icon?: string;
  group: 'navigation' | 'boards' | 'people' | 'templates' | 'actions';
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const { data: boardsData } = useBoards();
  const { data: usersData } = useUsers();
  const { data: tmplData } = useTemplates();
  const { setTheme } = useTheme();
  useEscapeKey(onClose);

  const commands = useMemo<Command[]>(() => {
    const items: Command[] = [
      // Navigation
      { id: 'nav-boards', label: '보드', keywords: 'boards 보드 홈', icon: '📋', group: 'navigation', action: () => { navigate('/'); onClose(); } },
      { id: 'nav-templates', label: '템플릿', keywords: 'templates 템플릿', icon: '📄', group: 'navigation', action: () => { navigate('/templates'); onClose(); } },
      { id: 'nav-directory', label: '디렉터리', keywords: 'directory people 사용자 조직', icon: '👥', group: 'navigation', action: () => { navigate('/directory'); onClose(); } },
      { id: 'nav-settings', label: '설정', keywords: 'settings 설정', icon: '⚙️', group: 'navigation', action: () => { navigate('/settings'); onClose(); } },
      { id: 'nav-profile', label: '프로필', keywords: 'profile 프로필 내 정보', icon: '👤', group: 'navigation', action: () => { navigate('/profile'); onClose(); } },
      // Theme
      { id: 'theme-light', label: '라이트 모드로 전환', keywords: 'theme light 라이트', icon: '☀️', group: 'actions', action: () => { setTheme('light'); onClose(); } },
      { id: 'theme-dark', label: '다크 모드로 전환', keywords: 'theme dark 다크', icon: '🌙', group: 'actions', action: () => { setTheme('dark'); onClose(); } },
      { id: 'theme-system', label: '시스템 테마 따르기', keywords: 'theme system 시스템', icon: '💻', group: 'actions', action: () => { setTheme('system'); onClose(); } },
    ];
    // Boards
    for (const b of boardsData?.items ?? []) {
      items.push({
        id: `board-${b.id}`,
        label: b.title,
        hint: '보드 열기',
        keywords: `board ${b.title}`,
        icon: '📋',
        group: 'boards',
        action: () => { navigate(`/boards/${b.id}`); onClose(); },
      });
    }
    // Templates
    for (const t of tmplData?.items ?? []) {
      items.push({
        id: `tmpl-${t.id}`,
        label: t.name,
        hint: '템플릿',
        keywords: `template ${t.name}`,
        icon: '📄',
        group: 'templates',
        action: () => { navigate('/templates'); onClose(); },
      });
    }
    // People
    for (const u of usersData?.items ?? []) {
      items.push({
        id: `user-${u.id}`,
        label: u.name,
        hint: u.email,
        keywords: `user ${u.name} ${u.email}`,
        icon: '👤',
        group: 'people',
        action: () => { navigate('/directory'); onClose(); },
      });
    }
    return items;
  }, [boardsData, tmplData, usersData, navigate, onClose, setTheme]);

  const filtered = useMemo(() => {
    if (!query) return commands.slice(0, 12);
    const q = query.toLowerCase();
    return commands
      .filter((c) => c.label.toLowerCase().includes(q) || c.keywords.toLowerCase().includes(q))
      .slice(0, 15);
  }, [commands, query]);

  useEffect(() => { setSelected(0); }, [query]);

  const groupLabels: Record<Command['group'], string> = {
    navigation: '이동',
    boards: '보드',
    people: '사람',
    templates: '템플릿',
    actions: '작업',
  };

  const grouped = useMemo(() => {
    const g: Record<string, Command[]> = {};
    for (const c of filtered) {
      if (!g[c.group]) g[c.group] = [];
      g[c.group].push(c);
    }
    return g;
  }, [filtered]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[selected]?.action();
    }
  };

  let globalIdx = -1;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="w-full max-w-lg flex flex-col"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--color-border)',
          }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: 'var(--color-text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              autoFocus
              type="text"
              placeholder="명령 검색... (보드, 사람, 템플릿, 테마 전환)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--color-text)' }}
            />
            <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}>
              ESC
            </kbd>
          </div>
          {/* Results */}
          <div className="overflow-y-auto max-h-[50vh]">
            {filtered.length === 0 && (
              <p className="text-sm text-center py-8" style={{ color: 'var(--color-text-muted)' }}>
                결과가 없습니다
              </p>
            )}
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-muted)' }}>
                  {groupLabels[group as Command['group']]}
                </div>
                {items.map((c) => {
                  globalIdx += 1;
                  const isSelected = globalIdx === selected;
                  return (
                    <button
                      key={c.id}
                      onClick={() => c.action()}
                      onMouseEnter={() => setSelected(globalIdx)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm"
                      style={{
                        backgroundColor: isSelected ? 'var(--color-surface-active)' : 'transparent',
                        color: 'var(--color-text)',
                      }}
                    >
                      <span className="flex-shrink-0">{c.icon}</span>
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.hint && (
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {c.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {/* Footer */}
          <div
            className="flex items-center justify-between px-4 py-2 text-xs"
            style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            <span>↑↓ 이동 · Enter 실행 · ESC 닫기</span>
            <span>Ctrl+K</span>
          </div>
        </div>
      </div>
    </>
  );
}
