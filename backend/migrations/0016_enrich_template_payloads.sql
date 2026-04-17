-- Enrich seed template payloads with custom_fields and default_tasks
-- to align with the field generalization (priority/status → custom fields).

-- Common Priority options used across templates:
-- [{"label":"Urgent","color":"critical"},{"label":"High","color":"orange"},{"label":"Medium","color":"warning"},{"label":"Low","color":"success"}]

-- 1. Kanban Basic
UPDATE templates SET payload = jsonb_set(jsonb_set(payload::jsonb,
  '{custom_fields}',
  '[{"name":"Priority","field_type":"select","options":[{"label":"Urgent","color":"critical"},{"label":"High","color":"orange"},{"label":"Medium","color":"warning"},{"label":"Low","color":"success"}],"required":false,"show_on_card":true},{"name":"Estimate","field_type":"number","options":[],"required":false,"show_on_card":true}]'::jsonb),
  '{default_tasks}',
  '[{"title":"Example task","column_index":0}]'::jsonb)
WHERE id = '019d8230-0001-7000-8000-000000000001';

-- 2. Sprint Board
UPDATE templates SET payload = jsonb_set(jsonb_set(payload::jsonb,
  '{custom_fields}',
  '[{"name":"Priority","field_type":"select","options":[{"label":"Urgent","color":"critical"},{"label":"High","color":"orange"},{"label":"Medium","color":"warning"},{"label":"Low","color":"success"}],"required":false,"show_on_card":true},{"name":"Story Points","field_type":"number","options":[],"required":false,"show_on_card":true},{"name":"Sprint","field_type":"select","options":[{"label":"Sprint 1","color":"info"},{"label":"Sprint 2","color":"warning"},{"label":"Sprint 3","color":"success"}],"required":false,"show_on_card":false}]'::jsonb),
  '{default_tasks}',
  '[{"title":"Setup sprint board","column_index":0},{"title":"Sprint planning meeting","column_index":0}]'::jsonb)
WHERE id = '019d8230-0002-7000-8000-000000000002';

-- 3. Team Task Board
UPDATE templates SET payload = jsonb_set(jsonb_set(payload::jsonb,
  '{custom_fields}',
  '[{"name":"Priority","field_type":"select","options":[{"label":"Urgent","color":"critical"},{"label":"High","color":"orange"},{"label":"Medium","color":"warning"},{"label":"Low","color":"success"}],"required":false,"show_on_card":true},{"name":"Area","field_type":"select","options":[{"label":"Frontend","color":"info"},{"label":"Backend","color":"success"},{"label":"Design","color":"accent"},{"label":"QA","color":"warning"}],"required":false,"show_on_card":true}]'::jsonb),
  '{default_tasks}',
  '[{"title":"Review weekly goals","column_index":0},{"title":"Team standup notes","column_index":0}]'::jsonb)
WHERE id = '019d8230-0003-7000-8000-000000000003';

-- 4. Roadmap
UPDATE templates SET payload = jsonb_set(jsonb_set(payload::jsonb,
  '{custom_fields}',
  '[{"name":"Priority","field_type":"select","options":[{"label":"Urgent","color":"critical"},{"label":"High","color":"orange"},{"label":"Medium","color":"warning"},{"label":"Low","color":"success"}],"required":false,"show_on_card":true},{"name":"Target Release","field_type":"text","options":[],"required":false,"show_on_card":false},{"name":"Progress","field_type":"progress","options":[],"required":false,"show_on_card":true}]'::jsonb),
  '{default_tasks}',
  '[{"title":"Define Q1 objectives","column_index":1},{"title":"Review roadmap priorities","column_index":0}]'::jsonb)
WHERE id = '019d8230-0004-7000-8000-000000000004';

-- 5. Schedule Calendar
UPDATE templates SET payload = jsonb_set(jsonb_set(payload::jsonb,
  '{custom_fields}',
  '[{"name":"Location","field_type":"text","options":[],"required":false,"show_on_card":true},{"name":"Organizer","field_type":"person","options":[],"required":false,"show_on_card":true}]'::jsonb),
  '{default_tasks}',
  '[{"title":"Kickoff meeting","column_index":0}]'::jsonb)
WHERE id = '019d8230-0005-7000-8000-000000000005';

-- 6. Vacation Calendar
UPDATE templates SET payload = jsonb_set(jsonb_set(payload::jsonb,
  '{custom_fields}',
  '[{"name":"Reason","field_type":"text","options":[],"required":false,"show_on_card":true}]'::jsonb),
  '{default_tasks}',
  '[]'::jsonb)
WHERE id = '019d8230-0006-7000-8000-000000000006';

-- 7. Bug Triage
UPDATE templates SET payload = jsonb_set(jsonb_set(payload::jsonb,
  '{custom_fields}',
  '[{"name":"Priority","field_type":"select","options":[{"label":"P0-Critical","color":"critical"},{"label":"P1-High","color":"orange"},{"label":"P2-Medium","color":"warning"},{"label":"P3-Low","color":"success"}],"required":true,"show_on_card":true},{"name":"Reproducibility","field_type":"select","options":[{"label":"Always","color":"critical"},{"label":"Sometimes","color":"warning"},{"label":"Rare","color":"info"}],"required":false,"show_on_card":true},{"name":"Impact Area","field_type":"text","options":[],"required":false,"show_on_card":false}]'::jsonb),
  '{default_tasks}',
  '[{"title":"Sample bug report","column_index":0}]'::jsonb)
WHERE id = '019d8230-0007-7000-8000-000000000007';

-- 8. Project Tracker
UPDATE templates SET payload = jsonb_set(jsonb_set(payload::jsonb,
  '{custom_fields}',
  '[{"name":"Priority","field_type":"select","options":[{"label":"Urgent","color":"critical"},{"label":"High","color":"orange"},{"label":"Medium","color":"warning"},{"label":"Low","color":"success"}],"required":false,"show_on_card":true},{"name":"Progress","field_type":"progress","options":[],"required":false,"show_on_card":true},{"name":"Team","field_type":"select","options":[{"label":"Dev","color":"info"},{"label":"QA","color":"warning"},{"label":"PM","color":"accent"}],"required":false,"show_on_card":true}]'::jsonb),
  '{default_tasks}',
  '[{"title":"Project setup","column_index":0},{"title":"Define requirements","column_index":0}]'::jsonb)
WHERE id = '019d8230-0008-7000-8000-000000000008';
