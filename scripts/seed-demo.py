#!/usr/bin/env python3
"""Seed demo data: departments, templates, boards, and tasks.

Fully self-contained — safe to run on a fresh database.
Re-running is mostly idempotent: boards/tasks will be duplicated if run twice,
but departments and templates match by slug/name and are skipped when present.

Pre-req: dev backend running at http://localhost:8080 with TASKBOARD_DEV_AUTH=1.
Typical flow:

    python scripts/seed-users.py      # JIT-provision glauth users
    python scripts/seed-demo.py       # then seed the demo workspace
"""
from __future__ import annotations
import sys
from typing import Any

import requests

API = "http://localhost:8080/api"


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def login(email: str = "admin@example.com") -> dict[str, str]:
    r = requests.post(f"{API}/dev/login", json={"user_email": email})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


def get(path: str, headers: dict[str, str]) -> Any:
    r = requests.get(f"{API}{path}", headers=headers)
    r.raise_for_status()
    return r.json()


def post(path: str, headers: dict[str, str], body: dict[str, Any]) -> Any:
    r = requests.post(f"{API}{path}", headers=headers, json=body)
    if not r.ok:
        print(f"  POST {path} -> {r.status_code} {r.text[:300]}", file=sys.stderr)
        r.raise_for_status()
    return r.json() if r.content else {}


def put(path: str, headers: dict[str, str], body: dict[str, Any]) -> None:
    r = requests.put(f"{API}{path}", headers=headers, json=body)
    r.raise_for_status()


# ---------------------------------------------------------------------------
# Departments
# ---------------------------------------------------------------------------
DEPARTMENTS = [
    # (slug, name) — slug MUST match the AD/glauth group name for OIDC sync
    ("engineering", "Engineering"),
    ("eng-backend", "Backend"),
    ("eng-frontend", "Frontend"),
    ("design", "Design"),
    ("design-ux", "UX Design"),
    ("management", "Management"),
    ("qa", "QA"),
]


def ensure_departments(H: dict[str, str]) -> dict[str, str]:
    existing = {d["slug"]: d["id"] for d in get("/departments?limit=100", H)["items"]}
    out: dict[str, str] = {}
    for slug, name in DEPARTMENTS:
        if slug in existing:
            out[slug] = existing[slug]
            continue
        r = post("/departments", H, {"slug": slug, "name": name})
        out[slug] = r["id"]
        print(f"  dept: {slug} -> {r['id']}")
    return out


# ---------------------------------------------------------------------------
# Templates — (name, description, payload)
# payload = { columns, labels, custom_fields, default_tasks }
# ---------------------------------------------------------------------------
def sel(values: list[str], colors: list[str] | None = None) -> list[dict[str, Any]]:
    opts = []
    for i, v in enumerate(values):
        opt: dict[str, Any] = {"label": v}
        if colors and i < len(colors):
            opt["color"] = colors[i]
        opts.append(opt)
    return opts


TEMPLATES = [
    dict(
        name="Sprint Board",
        description="Kanban sprint tracking with story points",
        payload={
            "columns": [{"title": t} for t in ["Backlog", "Sprint", "In Progress", "Review", "Done"]],
            "labels": [
                {"name": "Story", "color": "#3b82f6"},
                {"name": "Task", "color": "#10b981"},
                {"name": "Bug", "color": "#ef4444"},
                {"name": "Spike", "color": "#f59e0b"},
            ],
            "custom_fields": [
                {"name": "Priority", "field_type": "select",
                 "options": sel(["Urgent", "High", "Medium", "Low"],
                                ["#ef4444", "#f59e0b", "#3b82f6", "#94a3b8"]),
                 "show_on_card": True},
                {"name": "Story Points", "field_type": "number"},
                {"name": "Sprint", "field_type": "select",
                 "options": sel(["Sprint 1", "Sprint 2", "Sprint 3"])},
            ],
        },
    ),
    dict(
        name="Team Task Board",
        description="Weekly team task management",
        payload={
            "columns": [{"title": t} for t in ["Inbox", "This Week", "In Progress", "Blocked", "Complete"]],
            "labels": [
                {"name": "Urgent", "color": "#ef4444"},
                {"name": "Normal", "color": "#3b82f6"},
            ],
            "custom_fields": [
                {"name": "Priority", "field_type": "select",
                 "options": sel(["High", "Medium", "Low"],
                                ["#ef4444", "#3b82f6", "#94a3b8"]),
                 "show_on_card": True},
                {"name": "Area", "field_type": "select",
                 "options": sel(["Frontend", "Backend", "Design", "QA"])},
            ],
        },
    ),
    dict(
        name="Roadmap",
        description="Long-range product roadmap",
        payload={
            "columns": [{"title": t} for t in ["Icebox", "Q1", "Q2", "Q3", "Q4"]],
            "labels": [
                {"name": "Epic", "color": "#8b5cf6"},
                {"name": "Must-have", "color": "#ef4444"},
                {"name": "Nice-to-have", "color": "#10b981"},
                {"name": "Tech Debt", "color": "#6b7280"},
            ],
            "custom_fields": [
                {"name": "Priority", "field_type": "select",
                 "options": sel(["Urgent", "High", "Medium", "Low"])},
                {"name": "Target Release", "field_type": "text"},
                {"name": "Progress", "field_type": "number"},
            ],
        },
    ),
    dict(
        name="Schedule Calendar",
        description="Meetings and milestones",
        payload={
            "columns": [{"title": t} for t in ["Planned", "Scheduled", "Cancelled"]],
            "labels": [
                {"name": "Meeting", "color": "#3b82f6"},
                {"name": "Milestone", "color": "#f59e0b"},
                {"name": "Deadline", "color": "#ef4444"},
                {"name": "Review", "color": "#8b5cf6"},
            ],
            "custom_fields": [
                {"name": "Location", "field_type": "text"},
            ],
        },
    ),
    dict(
        name="Vacation Tracker",
        description="Team vacation status",
        payload={
            "columns": [{"title": t} for t in ["Requested", "Approved", "On Leave"]],
            "labels": [
                {"name": "Annual", "color": "#3b82f6"},
                {"name": "Personal", "color": "#8b5cf6"},
                {"name": "Comp Day", "color": "#10b981"},
            ],
            "custom_fields": [
                {"name": "Reason", "field_type": "text"},
            ],
        },
    ),
    dict(
        name="Bug Triage",
        description="Product bug tracking",
        payload={
            "columns": [{"title": t} for t in ["Reported", "Confirmed", "Fixing", "Testing", "Closed"]],
            "labels": [
                {"name": "Crash", "color": "#ef4444"},
                {"name": "Performance", "color": "#f59e0b"},
                {"name": "UI", "color": "#3b82f6"},
                {"name": "Security", "color": "#8b5cf6"},
            ],
            "custom_fields": [
                {"name": "Priority", "field_type": "select",
                 "options": sel(["P0-Critical", "P1-High", "P2-Medium", "P3-Low"],
                                ["#ef4444", "#f59e0b", "#3b82f6", "#94a3b8"]),
                 "show_on_card": True},
                {"name": "Reproducibility", "field_type": "select",
                 "options": sel(["Always", "Sometimes", "Rare"])},
                {"name": "Impact Area", "field_type": "text"},
            ],
        },
    ),
    dict(
        name="Project Tracker",
        description="End-to-end project lifecycle",
        payload={
            "columns": [{"title": t} for t in ["Planning", "Design", "Development", "Testing", "Deployed"]],
            "labels": [],
            "custom_fields": [
                {"name": "Priority", "field_type": "select",
                 "options": sel(["Urgent", "High", "Medium", "Low"]),
                 "show_on_card": True},
                {"name": "Progress", "field_type": "number"},
                {"name": "Team", "field_type": "select",
                 "options": sel(["PM", "Dev", "Design", "QA"])},
            ],
        },
    ),
]


def ensure_templates(H: dict[str, str]) -> dict[str, str]:
    """Return {template_name: template_id}. Idempotent by name."""
    existing = {t["name"]: t["id"] for t in get("/templates?limit=100", H)["items"]}
    out: dict[str, str] = {}
    for spec in TEMPLATES:
        name = spec["name"]
        if name in existing:
            out[name] = existing[name]
            continue
        r = post("/templates", H,
                 {"kind": "board", "name": name,
                  "description": spec["description"],
                  "scope": "global", "payload": spec["payload"]})
        out[name] = r["id"]
        print(f"  template: {name} -> {r['id']}")
    return out


# ---------------------------------------------------------------------------
# Demo boards — each entry is (template_name, board_title, owner_dept_slug, [tasks...])
# Boards are scoped to the listed department so only its members (plus the
# creator/SystemAdmin) can see them. Pick slugs so every user sees something.
# task = (title, column_title, {field_name: value, ...}, [label_names])
# ---------------------------------------------------------------------------
BOARDS: list[tuple[str, str, str, list[tuple[str, str, dict[str, Any], list[str]]]]] = [
    ("Sprint Board", "Sprint 2026-Q2", "eng-backend", [
        ("JWT -> OAuth2 Migration", "In Progress",
         {"Priority": "Urgent", "Story Points": 8, "Sprint": "Sprint 1",
          "_summary": "Auth system refactoring", "_priority": "urgent",
          "_due_date": "2026-04-25"},
         ["Story"]),
        ("Dashboard Chart Upgrade", "Sprint",
         {"Priority": "High", "Story Points": 5, "Sprint": "Sprint 1",
          "_summary": "Real-time data visualization", "_priority": "high",
          "_due_date": "2026-04-30"}, ["Story"]),
        ("API Response Caching", "Review",
         {"Priority": "Medium", "Story Points": 3, "Sprint": "Sprint 1",
          "_summary": "Add Redis cache layer", "_priority": "medium"}, ["Task"]),
        ("Login Error Message UX", "Done",
         {"Priority": "Low", "Story Points": 2, "Sprint": "Sprint 1",
          "_priority": "low"}, ["Bug"]),
        ("Mobile Responsive Layout", "Backlog",
         {"Priority": "High", "Story Points": 8, "Sprint": "Sprint 2",
          "_summary": "Tablet/mobile support", "_priority": "high",
          "_due_date": "2026-05-10"}, []),
        ("Performance Profiling", "Backlog",
         {"Priority": "Medium", "Story Points": 3, "Sprint": "Sprint 2",
          "_summary": "Bottleneck analysis", "_priority": "medium"}, ["Spike"]),
    ]),
    ("Team Task Board", "Team Task Board", "engineering", [
        ("Weekly Meeting Prep", "This Week",
         {"Priority": "Medium", "Area": "Frontend",
          "_priority": "medium", "_due_date": "2026-04-21"}, []),
        ("Code Review PR #482", "In Progress",
         {"Priority": "High", "Area": "Backend",
          "_summary": "Auth module review", "_priority": "high"}, []),
        ("Design Mockup Review", "Blocked",
         {"Priority": "Medium", "Area": "Design",
          "_summary": "Waiting UX feedback", "_priority": "medium"}, ["Normal"]),
        ("E2E Test Automation", "Inbox",
         {"Priority": "Low", "Area": "QA",
          "_summary": "Extend E2E coverage", "_priority": "low"}, []),
        ("Infra Monitoring Setup", "Complete",
         {"Priority": "High", "Area": "Backend", "_priority": "high"}, ["Urgent"]),
    ]),
    ("Roadmap", "2026 Roadmap", "management", [
        ("Multi-tenancy Support", "Q3",
         {"Priority": "Urgent", "Target Release": "v3.0", "Progress": 20,
          "_summary": "Per-org data isolation", "_priority": "urgent"},
         ["Epic", "Must-have"]),
        ("Real-time Collaboration", "Q2",
         {"Priority": "High", "Target Release": "v2.5", "Progress": 65,
          "_summary": "WebSocket co-editing", "_priority": "high",
          "_start_date": "2026-04-01", "_due_date": "2026-06-30"}, ["Epic"]),
        ("Mobile App MVP", "Q4",
         {"Priority": "Medium", "Target Release": "v4.0", "Progress": 0,
          "_summary": "iOS/Android native app", "_priority": "medium"},
         ["Nice-to-have"]),
        ("Legacy API Migration", "Q1",
         {"Priority": "High", "Target Release": "v2.0", "Progress": 100,
          "_priority": "high", "_start_date": "2026-01-15",
          "_due_date": "2026-03-31"}, ["Tech Debt"]),
        ("AI Recommendation Engine", "Icebox",
         {"Priority": "Low", "Progress": 0,
          "_summary": "Auto task classification", "_priority": "low"},
         ["Nice-to-have"]),
    ]),
    ("Schedule Calendar", "Team Schedule", "engineering", [
        ("Sprint Retrospective", "Scheduled",
         {"Location": "Meeting Room A", "_summary": "Sprint 1 retro",
          "_start_date": "2026-04-18", "_due_date": "2026-04-18"}, ["Meeting"]),
        ("Product Demo Day", "Planned",
         {"Location": "Main Hall", "_summary": "Q2 mid-quarter demo",
          "_start_date": "2026-04-25", "_due_date": "2026-04-25"}, ["Milestone"]),
        ("Code Freeze", "Planned",
         {"_start_date": "2026-05-01", "_due_date": "2026-05-01"}, ["Deadline"]),
        ("Design Review Session", "Scheduled",
         {"Location": "Zoom (Online)", "_summary": "UX improvement review",
          "_start_date": "2026-04-22", "_due_date": "2026-04-22"}, ["Review"]),
    ]),
    ("Vacation Tracker", "Vacation Tracker", "management", [
        ("Kim Minsu - Annual Leave", "Approved",
         {"Reason": "Family trip",
          "_start_date": "2026-04-28", "_due_date": "2026-04-30"}, ["Annual"]),
        ("Park Jiyoung - Half Day", "On Leave",
         {"Reason": "Hospital visit",
          "_start_date": "2026-04-17", "_due_date": "2026-04-17"}, ["Personal"]),
        ("Lee Junho - Comp Day", "Requested",
         {"Reason": "Overtime compensation",
          "_start_date": "2026-05-05", "_due_date": "2026-05-05"}, ["Comp Day"]),
    ]),
    ("Bug Triage", "Bug Triage", "qa", [
        ("Infinite redirect after login", "Fixing",
         {"Priority": "P0-Critical", "Reproducibility": "Always",
          "Impact Area": "Authentication",
          "_summary": "Production critical", "_priority": "urgent"}, ["Crash"]),
        ("OOM on large file upload", "Confirmed",
         {"Priority": "P1-High", "Reproducibility": "Always",
          "Impact Area": "File Upload",
          "_summary": "Files > 100MB", "_priority": "high"}, ["Performance"]),
        ("Dark mode text invisible", "Reported",
         {"Priority": "P2-Medium", "Reproducibility": "Sometimes",
          "Impact Area": "UI/Theme",
          "_summary": "After theme change", "_priority": "medium"}, ["UI"]),
        ("Password change API XSS", "Fixing",
         {"Priority": "P0-Critical", "Reproducibility": "Always",
          "Impact Area": "Security",
          "_summary": "Security vulnerability", "_priority": "urgent"}, ["Security"]),
        ("Search pagination error", "Testing",
         {"Priority": "P3-Low", "Reproducibility": "Rare",
          "Impact Area": "Search", "_priority": "low"}, []),
        ("Duplicate notification emails", "Closed",
         {"Priority": "P2-Medium", "Reproducibility": "Sometimes",
          "_summary": "Fixed in v2.1.3", "_priority": "medium"}, []),
    ]),
    ("Project Tracker", "New Service Launch", "design", [
        ("Requirements Definition", "Planning",
         {"Priority": "High", "Progress": 80, "Team": "PM",
          "_summary": "PRD writing", "_priority": "high",
          "_due_date": "2026-04-25"}, []),
        ("UI/UX Design", "Design",
         {"Priority": "High", "Progress": 40, "Team": "PM",
          "_summary": "Wireframes + prototype", "_priority": "high",
          "_start_date": "2026-04-20", "_due_date": "2026-05-10"}, []),
        ("Backend API Development", "Development",
         {"Priority": "Urgent", "Progress": 25, "Team": "Dev",
          "_summary": "Core API endpoints", "_priority": "urgent",
          "_start_date": "2026-05-01", "_due_date": "2026-06-15"}, []),
        ("Frontend Implementation", "Development",
         {"Priority": "High", "Progress": 10, "Team": "Dev",
          "_summary": "React components", "_priority": "high",
          "_start_date": "2026-05-10", "_due_date": "2026-06-20"}, []),
        ("Integration Testing", "Testing",
         {"Priority": "Medium", "Progress": 0, "Team": "QA",
          "_summary": "E2E + perf tests", "_priority": "medium",
          "_due_date": "2026-06-30"}, []),
        ("Deploy Pipeline Setup", "Planning",
         {"Priority": "Medium", "Progress": 60, "Team": "Dev",
          "_summary": "CI/CD + staging", "_priority": "medium"}, []),
    ]),
]


def _iso(date: str, end: bool) -> str:
    return f"{date}T{'23:59:59' if end else '00:00:00'}Z"


def seed_boards(H: dict[str, str], tmpls: dict[str, str], depts: dict[str, str]) -> int:
    total_tasks = 0
    for tmpl_name, board_title, dept_slug, tasks in BOARDS:
        tmpl_id = tmpls[tmpl_name]
        dept_id = depts[dept_slug]
        board = post(f"/boards?from_template={tmpl_id}", H,
                     {"title": board_title, "description": f"Demo board: {board_title}",
                      "department_ids": [dept_id]})
        bid = board["id"]
        cols = {c["title"]: c["id"] for c in get(f"/boards/{bid}/columns", H)["items"]}
        flds = {f["name"]: f["id"] for f in get(f"/boards/{bid}/fields", H)["items"]}
        lbls = {l["name"]: l["id"] for l in get(f"/boards/{bid}/labels", H)["items"]}
        print(f"  board: {board_title} ({dept_slug}) -> {bid}")

        for title, col, fields, labels in tasks:
            body: dict[str, Any] = {"title": title, "column_id": cols[col]}
            if "_priority" in fields:
                body["priority"] = fields["_priority"]
            if "_summary" in fields:
                body["summary"] = fields["_summary"]
            if "_due_date" in fields:
                body["due_date"] = _iso(fields["_due_date"], end=True)
            if "_start_date" in fields:
                body["start_date"] = _iso(fields["_start_date"], end=False)
            tr = post(f"/boards/{bid}/tasks", H, body)
            tid = tr["id"]
            total_tasks += 1

            for fname, fval in fields.items():
                if fname.startswith("_") or fname not in flds:
                    continue
                put(f"/tasks/{tid}/fields/{flds[fname]}", H, {"value": str(fval)})
            for lname in labels:
                if lname in lbls:
                    post(f"/tasks/{tid}/labels", H, {"label_id": lbls[lname]})
    return total_tasks


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    H = login("admin@example.com")
    print("=== Ensuring departments ===")
    depts = ensure_departments(H)
    print(f"  {len(depts)} departments ready")

    print("=== Ensuring templates ===")
    tmpls = ensure_templates(H)
    print(f"  {len(tmpls)} templates ready")

    print("=== Creating boards ===")
    total_tasks = seed_boards(H, tmpls, depts)

    print(f"\n=== Done. {len(BOARDS)} boards with {total_tasks} tasks. ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
