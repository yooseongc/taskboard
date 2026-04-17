#!/usr/bin/env python3
"""JIT-provision glauth users into the backend AND wire department memberships.

Dev-auth tokens do not carry a `groups` claim, so the OIDC group->department
sync in authz/authn.rs never fires for dev-login sessions. This script
compensates by:

1. Parsing infra/glauth/glauth.cfg to learn each user's primary group.
2. Calling /api/dev/login per user (JIT-creates users table rows).
3. Looking up the matching department by slug (= group name).
4. POSTing /api/departments/{id}/members for the {user, department} pair.

Pre-req: backend running at http://localhost:8080 with TASKBOARD_DEV_AUTH=1,
and departments already created (run scripts/seed-demo.py first, or the dept
seeding inside it).
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
from typing import Any

import requests

API = "http://localhost:8080/api"
GLAUTH_CFG = Path(__file__).resolve().parent.parent / "infra" / "glauth" / "glauth.cfg"
ADMIN_EMAIL = "admin@example.com"

# Hierarchical parents — a user assigned to a sub-department is also added to
# its parent so boards scoped at the parent level remain visible. The backend
# visibility check is a strict dept_id match (no tree walking), so we fan out
# at seed time instead.
PARENT_DEPT = {
    "eng-backend": "engineering",
    "eng-frontend": "engineering",
    "design-ux": "design",
}


# ---------------------------------------------------------------------------
# glauth.cfg parsing
# ---------------------------------------------------------------------------
USER_BLOCK = re.compile(
    r'^\s*name\s*=\s*"([^"]+)"\s*\n'
    r'(?:^\s*(?:givenname|sn)\s*=\s*"[^"]+"\s*\n)*'
    r'^\s*mail\s*=\s*"([^"]+)"\s*\n'
    r'^\s*uidnumber\s*=\s*\d+\s*\n'
    r'^\s*primarygroup\s*=\s*(\d+)',
    re.MULTILINE,
)
GROUP_BLOCK = re.compile(
    r'^\s*name\s*=\s*"([^"]+)"\s*\n\s*gidnumber\s*=\s*(\d+)',
    re.MULTILINE,
)


def parse_glauth() -> tuple[list[tuple[str, str]], dict[int, str]]:
    """Return (user_email, group_name) pairs + {gid: group_name} lookup."""
    text = GLAUTH_CFG.read_text(encoding="utf-8")

    # Split at the first [[groups]] marker so the group-block `name = "..."`
    # lines don't collide with the user-block parser.
    split_at = text.find("[[groups]]")
    if split_at == -1:
        return [], {}
    users_section, groups_section = text[:split_at], text[split_at:]

    groups: dict[int, str] = {
        name: int(gid)
        for name, gid in GROUP_BLOCK.findall(groups_section)
    }
    # flip to {gid: name}
    by_gid = {gid: name for name, gid in groups.items()}

    mappings: list[tuple[str, str]] = []
    for _, email, gid_str in USER_BLOCK.findall(users_section):
        if email.endswith("@taskboard.local"):
            continue
        gname = by_gid.get(int(gid_str))
        if gname:
            mappings.append((email, gname))
    return mappings, by_gid


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
def login(email: str) -> dict[str, str]:
    r = requests.post(f"{API}/dev/login", json={"user_email": email})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


def get(path: str, h: dict[str, str]) -> Any:
    r = requests.get(f"{API}{path}", headers=h)
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    if not GLAUTH_CFG.exists():
        print(f"glauth config not found: {GLAUTH_CFG}", file=sys.stderr)
        return 1

    mappings, _ = parse_glauth()
    if not mappings:
        print("No users parsed from glauth.cfg", file=sys.stderr)
        return 1

    # 1) JIT-provision every user by hitting dev-login.
    print(f"Provisioning {len(mappings)} users via dev-login…")
    for email, _ in mappings:
        requests.post(f"{API}/dev/login", json={"user_email": email}).raise_for_status()
        print(f"  OK {email}")

    # 2) Build lookup tables from the admin session.
    admin_h = login(ADMIN_EMAIL)
    depts = {d["slug"]: d["id"] for d in get("/departments?limit=100", admin_h)["items"]}
    users = {u["email"]: u["id"] for u in get("/users?limit=100", admin_h)["items"]}

    # 3) Expand mappings: every user also joins the parent dept (if any).
    expanded: list[tuple[str, str]] = []
    for email, group_name in mappings:
        expanded.append((email, group_name))
        parent = PARENT_DEPT.get(group_name)
        if parent:
            expanded.append((email, parent))

    # 4) Assign department memberships (idempotent — backend rejects duplicates).
    print(f"\nAssigning {len(expanded)} department memberships "
          f"(incl. parent-dept fanout)…")
    added = 0
    skipped_missing_dept = 0
    skipped_missing_user = 0
    for email, group_name in expanded:
        dept_id = depts.get(group_name)
        user_id = users.get(email)
        if not dept_id:
            print(f"  SKIP dept '{group_name}' (not in backend — run seed-demo.py first)")
            skipped_missing_dept += 1
            continue
        if not user_id:
            print(f"  SKIP user '{email}' (not in backend)")
            skipped_missing_user += 1
            continue
        r = requests.post(
            f"{API}/departments/{dept_id}/members",
            headers=admin_h,
            json={"user_id": user_id, "role_in_department": "Member"},
        )
        if r.status_code == 201:
            print(f"  OK {email} -> {group_name}")
            added += 1
        elif r.status_code in (400, 409) and "already" in r.text.lower():
            print(f"  -- {email} -> {group_name} (already member)")
        else:
            print(f"  ERR {email} -> {group_name}: {r.status_code} {r.text[:200]}",
                  file=sys.stderr)

    print(
        f"\nDone. users={len(mappings)}, memberships_added={added}, "
        f"missing_dept={skipped_missing_dept}, missing_user={skipped_missing_user}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
