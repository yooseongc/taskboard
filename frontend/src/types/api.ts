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
