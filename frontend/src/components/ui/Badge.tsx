import { tagClass, type TagVariant } from '../../theme/constants';

interface BadgeProps {
  children: React.ReactNode;
  /**
   * Semantic family. Resolves to `var(--tag-<variant>-{bg,text})` in
   * `index.css`, which flips automatically between light and dark mode.
   */
  variant?: TagVariant;
  /**
   * Explicit class override. Takes precedence over `variant`. Use when a
   * caller has a bespoke color requirement that doesn't fit the 8-family
   * palette — otherwise prefer `variant`.
   */
  className?: string;
}

/**
 * Inline chip used across status / priority / role / label surfaces.
 *
 * ```tsx
 * <Badge variant="success">Active</Badge>
 * <Badge variant="warning">In Progress</Badge>
 * ```
 *
 * See STYLE_GUIDE.md § Tag Palette for the full variant matrix.
 */
export default function Badge({
  children,
  variant = 'neutral',
  className,
}: BadgeProps) {
  const classes = className ?? tagClass(variant);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes}`}
    >
      {children}
    </span>
  );
}
