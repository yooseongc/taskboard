#!/usr/bin/env python3
"""JIT-provision all dev users into the backend by calling /api/dev/login.

Dev-auth trigger upsert_user_from_claims on every login, so hitting the
endpoint once per email seeds the `users` table. Groups (departments) are
synced from the JWT `groups` claim if `OIDC_DEPT_SYNC_ENABLED=true` on the
backend — but dev-auth tokens today do not carry groups, so department
membership is set separately via seed-demo-users.py department assignments.

Reads glauth.cfg to discover emails automatically.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

import requests

API = "http://localhost:8080/api"
GLAUTH_CFG = Path(__file__).resolve().parent.parent / "infra" / "glauth" / "glauth.cfg"


def discover_emails() -> list[str]:
    """Extract `mail = "…"` entries from glauth config, excluding service accts."""
    text = GLAUTH_CFG.read_text(encoding="utf-8")
    emails = re.findall(r'^\s*mail\s*=\s*"([^"]+)"', text, flags=re.MULTILINE)
    return [e for e in emails if not e.endswith("@taskboard.local")]


def provision(email: str) -> str:
    r = requests.post(f"{API}/dev/login", json={"user_email": email}, timeout=5)
    r.raise_for_status()
    return r.json()["token"]


def main() -> int:
    emails = discover_emails()
    if not emails:
        print("No emails found in glauth.cfg", file=sys.stderr)
        return 1
    print(f"Provisioning {len(emails)} users into the backend…")
    for email in emails:
        try:
            provision(email)
            print(f"  OK {email}")
        except requests.RequestException as exc:
            print(f"  ERR {email}: {exc}", file=sys.stderr)
            return 2
    print(f"Done. {len(emails)} users now present in the users table.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
