#!/usr/bin/env python3
"""Seed demo boards from all templates with rich task data."""
import json, requests, sys

API = "http://localhost:8080/api"
DEPT = "019d8210-0002-7000-8000-000000000002"

# Login
r = requests.post(f"{API}/dev/login", json={"user_email": "alice@example.com"})
TOKEN = r.json()["token"]
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def board(title, desc, tmpl):
    r = requests.post(f"{API}/boards?from_template={tmpl}", headers=H,
                       json={"title": title, "description": desc, "department_ids": [DEPT]})
    r.raise_for_status()
    bid = r.json()["id"]
    print(f"  Board: {title} -> {bid}")
    return bid

def get_columns(bid):
    r = requests.get(f"{API}/boards/{bid}/columns", headers=H)
    return {c["title"]: c["id"] for c in r.json()["items"]}

def get_fields(bid):
    r = requests.get(f"{API}/boards/{bid}/fields", headers=H)
    return {f["name"]: f["id"] for f in r.json()["items"]}

def get_labels(bid):
    r = requests.get(f"{API}/boards/{bid}/labels", headers=H)
    return {l["name"]: l["id"] for l in r.json()["items"]}

def task(bid, title, col_id, **kw):
    body = {"board_id": bid, "title": title, "column_id": col_id}
    for k in ["priority", "summary"]:
        if k in kw:
            body[k] = kw[k]
    if "due_date" in kw:
        body["due_date"] = kw["due_date"] + "T23:59:59Z"
    if "start_date" in kw:
        body["start_date"] = kw["start_date"] + "T00:00:00Z"
    r = requests.post(f"{API}/boards/{bid}/tasks", headers=H, json=body)
    if not r.ok:
        print(f"  TASK ERR: {r.status_code} {r.text[:200]}", file=sys.stderr)
        r.raise_for_status()
    return r.json()["id"]

def fv(tid, fid, val):
    requests.put(f"{API}/tasks/{tid}/fields/{fid}", headers=H, json={"value": val})

def label(tid, lid):
    requests.post(f"{API}/tasks/{tid}/labels", headers=H, json={"label_id": lid})

print("=== Creating boards ===")

# Sprint Board
b = board("Sprint 2026-Q2", "2026 Q2 Sprint Board", "019d8230-0002-7000-8000-000000000002")
cols = get_columns(b); flds = get_fields(b); lbls = get_labels(b)
P, SP, SR = flds.get("Priority",""), flds.get("Story Points",""), flds.get("Sprint","")

t = task(b, "JWT -> OAuth2 Migration", cols["In Progress"], priority="urgent", summary="Auth system refactoring", due_date="2026-04-25")
fv(t, P, "Urgent"); fv(t, SP, 8); fv(t, SR, "Sprint 1")
if "Story" in lbls: label(t, lbls["Story"])

t = task(b, "Dashboard Chart Upgrade", cols["Sprint"], priority="high", summary="Real-time data visualization", due_date="2026-04-30")
fv(t, P, "High"); fv(t, SP, 5); fv(t, SR, "Sprint 1")
if "Story" in lbls: label(t, lbls["Story"])

t = task(b, "API Response Caching", cols["Review"], priority="medium", summary="Add Redis cache layer")
fv(t, P, "Medium"); fv(t, SP, 3); fv(t, SR, "Sprint 1")
if "Task" in lbls: label(t, lbls["Task"])

t = task(b, "Login Error Message UX", cols["Done"], priority="low")
fv(t, P, "Low"); fv(t, SP, 2); fv(t, SR, "Sprint 1")
if "Bug" in lbls: label(t, lbls["Bug"])

t = task(b, "Mobile Responsive Layout", cols["Backlog"], priority="high", summary="Tablet/mobile support", due_date="2026-05-10")
fv(t, P, "High"); fv(t, SP, 8); fv(t, SR, "Sprint 2")

t = task(b, "Performance Profiling", cols["Backlog"], priority="medium", summary="Bottleneck analysis")
fv(t, P, "Medium"); fv(t, SP, 3); fv(t, SR, "Sprint 2")
if "Spike" in lbls: label(t, lbls["Spike"])
print("  Sprint: 6 tasks")

# Team Task Board
b = board("Team Task Board", "Weekly team task management", "019d8230-0003-7000-8000-000000000003")
cols = get_columns(b); flds = get_fields(b); lbls = get_labels(b)
P, A = flds.get("Priority",""), flds.get("Area","")

t = task(b, "Weekly Meeting Prep", cols["This Week"], priority="medium", due_date="2026-04-21")
fv(t, P, "Medium"); fv(t, A, "Frontend")

t = task(b, "Code Review PR #482", cols["In Progress"], priority="high", summary="Auth module review")
fv(t, P, "High"); fv(t, A, "Backend")

t = task(b, "Design Mockup Review", cols["Blocked"], priority="medium", summary="Waiting UX feedback")
fv(t, P, "Medium"); fv(t, A, "Design")
if "Normal" in lbls: label(t, lbls["Normal"])

t = task(b, "E2E Test Automation", cols["Inbox"], priority="low", summary="Extend E2E coverage")
fv(t, P, "Low"); fv(t, A, "QA")

t = task(b, "Infra Monitoring Setup", cols["Complete"], priority="high")
fv(t, P, "High"); fv(t, A, "Backend")
if "Urgent" in lbls: label(t, lbls["Urgent"])
print("  Team: 5 tasks")

# Roadmap
b = board("2026 Roadmap", "Product roadmap for 2026", "019d8230-0004-7000-8000-000000000004")
cols = get_columns(b); flds = get_fields(b); lbls = get_labels(b)
P, TR, PR = flds.get("Priority",""), flds.get("Target Release",""), flds.get("Progress","")

t = task(b, "Multi-tenancy Support", cols["Q3"], priority="urgent", summary="Per-org data isolation")
fv(t, P, "Urgent"); fv(t, TR, "v3.0"); fv(t, PR, 20)
if "Epic" in lbls: label(t, lbls["Epic"])
if "Must-have" in lbls: label(t, lbls["Must-have"])

t = task(b, "Real-time Collaboration", cols["Q2"], priority="high", summary="WebSocket co-editing", start_date="2026-04-01", due_date="2026-06-30")
fv(t, P, "High"); fv(t, TR, "v2.5"); fv(t, PR, 65)
if "Epic" in lbls: label(t, lbls["Epic"])

t = task(b, "Mobile App MVP", cols["Q4"], priority="medium", summary="iOS/Android native app")
fv(t, P, "Medium"); fv(t, TR, "v4.0"); fv(t, PR, 0)
if "Nice-to-have" in lbls: label(t, lbls["Nice-to-have"])

t = task(b, "Legacy API Migration", cols["Q1"], priority="high", start_date="2026-01-15", due_date="2026-03-31")
fv(t, P, "High"); fv(t, TR, "v2.0"); fv(t, PR, 100)
if "Tech Debt" in lbls: label(t, lbls["Tech Debt"])

t = task(b, "AI Recommendation Engine", cols["Icebox"], priority="low", summary="Auto task classification")
fv(t, P, "Low"); fv(t, PR, 0)
if "Nice-to-have" in lbls: label(t, lbls["Nice-to-have"])
print("  Roadmap: 5 tasks")

# Schedule Calendar
b = board("Team Schedule", "Meetings and milestones", "019d8230-0005-7000-8000-000000000005")
cols = get_columns(b); flds = get_fields(b); lbls = get_labels(b)
LOC = flds.get("Location","")

t = task(b, "Sprint Retrospective", cols["Scheduled"], summary="Sprint 1 retro", start_date="2026-04-18", due_date="2026-04-18")
fv(t, LOC, "Meeting Room A")
if "Meeting" in lbls: label(t, lbls["Meeting"])

t = task(b, "Product Demo Day", cols["Planned"], summary="Q2 mid-quarter demo", start_date="2026-04-25", due_date="2026-04-25")
fv(t, LOC, "Main Hall")
if "Milestone" in lbls: label(t, lbls["Milestone"])

t = task(b, "Code Freeze", cols["Planned"], start_date="2026-05-01", due_date="2026-05-01")
if "Deadline" in lbls: label(t, lbls["Deadline"])

t = task(b, "Design Review Session", cols["Scheduled"], summary="UX improvement review", start_date="2026-04-22", due_date="2026-04-22")
fv(t, LOC, "Zoom (Online)")
if "Review" in lbls: label(t, lbls["Review"])
print("  Schedule: 4 tasks")

# Vacation Calendar
b = board("Vacation Tracker", "Team vacation status", "019d8230-0006-7000-8000-000000000006")
cols = get_columns(b); flds = get_fields(b); lbls = get_labels(b)
RSN = flds.get("Reason","")

t = task(b, "Kim Minsu - Annual Leave", cols["Approved"], start_date="2026-04-28", due_date="2026-04-30")
fv(t, RSN, "Family trip")
if "Annual" in lbls: label(t, lbls["Annual"])

t = task(b, "Park Jiyoung - Half Day", cols["On Leave"], start_date="2026-04-17", due_date="2026-04-17")
fv(t, RSN, "Hospital visit")
if "Personal" in lbls: label(t, lbls["Personal"])

t = task(b, "Lee Junho - Comp Day", cols["Requested"], start_date="2026-05-05", due_date="2026-05-05")
fv(t, RSN, "Overtime compensation")
if "Comp Day" in lbls: label(t, lbls["Comp Day"])
print("  Vacation: 3 tasks")

# Bug Triage
b = board("Bug Triage", "Product bug tracking", "019d8230-0007-7000-8000-000000000007")
cols = get_columns(b); flds = get_fields(b); lbls = get_labels(b)
P, RP, IM = flds.get("Priority",""), flds.get("Reproducibility",""), flds.get("Impact Area","")

t = task(b, "Infinite redirect after login", cols["Fixing"], priority="urgent", summary="Production critical")
fv(t, P, "P0-Critical"); fv(t, RP, "Always"); fv(t, IM, "Authentication")
if "Crash" in lbls: label(t, lbls["Crash"])

t = task(b, "OOM on large file upload", cols["Confirmed"], priority="high", summary="Files > 100MB")
fv(t, P, "P1-High"); fv(t, RP, "Always"); fv(t, IM, "File Upload")
if "Performance" in lbls: label(t, lbls["Performance"])

t = task(b, "Dark mode text invisible", cols["Reported"], priority="medium", summary="After theme change")
fv(t, P, "P2-Medium"); fv(t, RP, "Sometimes"); fv(t, IM, "UI/Theme")
if "UI" in lbls: label(t, lbls["UI"])

t = task(b, "Password change API XSS", cols["Fixing"], priority="urgent", summary="Security vulnerability")
fv(t, P, "P0-Critical"); fv(t, RP, "Always"); fv(t, IM, "Security")
if "Security" in lbls: label(t, lbls["Security"])

t = task(b, "Search pagination error", cols["Testing"], priority="low")
fv(t, P, "P3-Low"); fv(t, RP, "Rare"); fv(t, IM, "Search")

t = task(b, "Duplicate notification emails", cols["Closed"], priority="medium", summary="Fixed in v2.1.3")
fv(t, P, "P2-Medium"); fv(t, RP, "Sometimes")
print("  Bug: 6 tasks")

# Project Tracker
b = board("New Service Launch", "Q3 new service project", "019d8230-0008-7000-8000-000000000008")
cols = get_columns(b); flds = get_fields(b); lbls = get_labels(b)
P, PR, TM = flds.get("Priority",""), flds.get("Progress",""), flds.get("Team","")

t = task(b, "Requirements Definition", cols["Planning"], priority="high", summary="PRD writing", due_date="2026-04-25")
fv(t, P, "High"); fv(t, PR, 80); fv(t, TM, "PM")

t = task(b, "UI/UX Design", cols["Design"], priority="high", summary="Wireframes + prototype", start_date="2026-04-20", due_date="2026-05-10")
fv(t, P, "High"); fv(t, PR, 40); fv(t, TM, "PM")

t = task(b, "Backend API Development", cols["Development"], priority="urgent", summary="Core API endpoints", start_date="2026-05-01", due_date="2026-06-15")
fv(t, P, "Urgent"); fv(t, PR, 25); fv(t, TM, "Dev")

t = task(b, "Frontend Implementation", cols["Development"], priority="high", summary="React components", start_date="2026-05-10", due_date="2026-06-20")
fv(t, P, "High"); fv(t, PR, 10); fv(t, TM, "Dev")

t = task(b, "Integration Testing", cols["Testing"], priority="medium", summary="E2E + perf tests", due_date="2026-06-30")
fv(t, P, "Medium"); fv(t, PR, 0); fv(t, TM, "QA")

t = task(b, "Deploy Pipeline Setup", cols["Planning"], priority="medium", summary="CI/CD + staging")
fv(t, P, "Medium"); fv(t, PR, 60); fv(t, TM, "Dev")
print("  Project: 6 tasks")

print("\n=== Done! 7 boards with 35 tasks ===")
