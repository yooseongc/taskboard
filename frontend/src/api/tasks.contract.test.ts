// Contract test: the raw API helpers in api/tasks.ts and api/customFields.ts
// issue requests with the exact URL + method + body shape the backend expects.
// This test guards against silent drift when endpoints are renamed on either side.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addTaskAssignee,
  removeTaskAssignee,
  addTaskLabel,
  removeTaskLabel,
} from './tasks';
import { setTaskFieldValue } from './customFields';
import { setToken } from '../auth';

type Call = { url: string; init: RequestInit };

describe('tasks / customFields raw API contract', () => {
  let calls: Call[] = [];
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setToken('stub');
    calls = [];
    fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('addTaskAssignee POSTs /api/tasks/:id/assignees with {user_id}', async () => {
    await addTaskAssignee('T1', 'U1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/api\/tasks\/T1\/assignees$/);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ user_id: 'U1' });
  });

  it('removeTaskAssignee DELETEs /api/tasks/:id/assignees/:userId', async () => {
    await removeTaskAssignee('T1', 'U1');
    expect(calls[0].url).toMatch(/\/api\/tasks\/T1\/assignees\/U1$/);
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('addTaskLabel POSTs /api/tasks/:id/labels with {label_id}', async () => {
    await addTaskLabel('T1', 'L1');
    expect(calls[0].url).toMatch(/\/api\/tasks\/T1\/labels$/);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ label_id: 'L1' });
  });

  it('removeTaskLabel DELETEs /api/tasks/:id/labels/:labelId', async () => {
    await removeTaskLabel('T1', 'L1');
    expect(calls[0].url).toMatch(/\/api\/tasks\/T1\/labels\/L1$/);
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('setTaskFieldValue PUTs /api/tasks/:id/fields/:fieldId with {value}', async () => {
    await setTaskFieldValue('T1', 'F1', 'Urgent');
    expect(calls[0].url).toMatch(/\/api\/tasks\/T1\/fields\/F1$/);
    expect(calls[0].init.method).toBe('PUT');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ value: 'Urgent' });
  });

  it('setTaskFieldValue accepts numeric and null values', async () => {
    await setTaskFieldValue('T1', 'F1', 42);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ value: 42 });
    await setTaskFieldValue('T1', 'F1', null);
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ value: null });
  });
});
