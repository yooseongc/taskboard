// TypeScript interfaces matching S-* contracts

/** S-001: Common error response */
export interface ApiError {
  error: string;
  message: string;
  request_id: string;
  details?: Record<string, unknown>;
}

/** S-002: Pagination */
export interface PaginationQuery {
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

/** S-006: Whoami response */
export type GlobalRole = 'SystemAdmin' | 'DepartmentAdmin' | 'Member' | 'Viewer';

export interface WhoamiResponse {
  id: string;
  external_id: string;
  name: string;
  email: string;
  email_verified: boolean;
  department_ids: string[];
  roles: GlobalRole[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** S-013: Board */
export interface Board {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  department_ids: string[];
  origin_template_id?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** S-017: Task */
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'archived';

export interface TaskDto {
  id: string;
  board_id: string;
  column_id: string;
  position: number;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  labels: LabelRef[];
  assignees: UserRef[];
  checklist_summary: { total: number; checked: number };
  comment_count: number;
  created_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface LabelRef {
  id: string;
  name: string;
  color: string;
}

export interface UserRef {
  id: string;
  name: string;
  email: string;
}

/** S-016: Column */
export interface BoardColumn {
  id: string;
  board_id: string;
  title: string;
  position: number;
  version: number;
  created_at: string;
}

/** S-011: Department */
export interface Department {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  path: string;
  depth: number;
  created_at: string;
  updated_at: string;
}

/** S-024: Activity log */
export interface ActivityLogEntry {
  id: string;
  board_id: string;
  task_id: string | null;
  actor_id: string;
  actor_name: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** S-021: Comment */
export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

/** S-022: Template */
export interface Template {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  department_ids: string[];
  snapshot: TemplateSnapshot;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateSnapshot {
  columns: TemplateColumn[];
  labels: TemplateLabelDef[];
  default_tasks: TemplateTask[];
}

export interface TemplateColumn {
  title: string;
  position: number;
}

export interface TemplateLabelDef {
  name: string;
  color: string;
}

export interface TemplateTask {
  title: string;
  column_index: number;
  priority: Priority;
  labels: string[];
  checklists: TemplateChecklist[];
}

export interface TemplateChecklist {
  title: string;
  items: string[];
}

/** S-019: Checklist */
export interface Checklist {
  id: string;
  task_id: string;
  title: string;
  items: ChecklistItem[];
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  title: string;
  checked: boolean;
  position: number;
}

/** Board member */
export interface BoardMember {
  user_id: string;
  board_id: string;
  role: string;
  user_name: string;
  user_email: string;
  joined_at: string;
}

/** Department member */
export interface DepartmentMember {
  user_id: string;
  department_id: string;
  role: string;
  user_name: string;
  user_email: string;
  joined_at: string;
}

/** User (admin listing) */
export interface User {
  id: string;
  external_id: string;
  name: string;
  email: string;
  email_verified: boolean;
  department_ids: string[];
  roles: GlobalRole[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Label (board-level definition) */
export interface Label {
  id: string;
  board_id: string;
  name: string;
  color: string;
  created_at: string;
}
