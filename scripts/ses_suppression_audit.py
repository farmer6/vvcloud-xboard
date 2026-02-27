#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SES Suppression List Daily Audit
- Pull SESv2 suppression list (ListSuppressedDestinations) with pagination
- Snapshot to jsonl
- Diff vs yesterday snapshot (new suppressions)
- Cross-check with XBoard DB users (email)
- Output report (md) + hits (csv) + diff (csv)

Safe-by-default:
- Read-only DB query
- No deletion from SES
"""

from __future__ import annotations

import csv
import dataclasses
import datetime as dt
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import boto3
import pymysql


@dataclasses.dataclass(frozen=True)
class AwsConfig:
    region: str


@dataclasses.dataclass(frozen=True)
class DbConfig:
    host: str
    port: int
    user: str
    password: str
    database: str
    # XBoard user email field/table can differ by fork; configurable.
    user_table: str = "users"
    email_column: str = "email"
    # Optional: only active users, etc. Leave empty to disable.
    where_sql: str = ""


@dataclasses.dataclass(frozen=True)
class RunConfig:
    out_dir: Path
    # Bounce / Complaint / None (all)
    reason_filter: Optional[str] = None
    page_size: int = 1000
    # For safety: cap total fetched to avoid runaway (set None for no cap)
    max_total: Optional[int] = None


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def today_ymd(tz: dt.tzinfo = dt.timezone.utc) -> str:
    return dt.datetime.now(tz).strftime("%Y%m%d")


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def load_env(name: str, default: Optional[str] = None, required: bool = False) -> Optional[str]:
    v = os.getenv(name, default)
    if required and not v:
        raise RuntimeError(f"Missing required env: {name}")
    return v


def get_aws_config() -> AwsConfig:
    region = load_env("AWS_REGION", required=True)
    return AwsConfig(region=region)


def get_db_config() -> DbConfig:
    return DbConfig(
        host=load_env("DB_HOST", required=True),
        port=int(load_env("DB_PORT", "3306") or "3306"),
        user=load_env("DB_USER", required=True),
        password=load_env("DB_PASSWORD", required=True),
        database=load_env("DB_NAME", required=True),
        user_table=load_env("DB_USER_TABLE", "users") or "users",
        email_column=load_env("DB_EMAIL_COLUMN", "email") or "email",
        where_sql=load_env("DB_USER_WHERE", "") or "",
    )


def get_run_config() -> RunConfig:
    out_dir = Path(load_env("OUT_DIR", "./out") or "./out").resolve()
    reason = load_env("SES_REASON", "") or ""
    reason_filter = reason.strip().upper() if reason.strip() else None
    page_size = int(load_env("SES_PAGE_SIZE", "1000") or "1000")
    max_total_raw = load_env("SES_MAX_TOTAL", "")
    max_total = int(max_total_raw) if max_total_raw else None

    return RunConfig(
        out_dir=out_dir,
        reason_filter=reason_filter,
        page_size=page_size,
        max_total=max_total,
    )


def ses_list_suppressed(aws: AwsConfig, run: RunConfig) -> List[dict]:
    """
    Call SESv2 ListSuppressedDestinations with pagination.
    Returns list of dicts:
      { email, reason, last_update_time }
    """
    client = boto3.client("sesv2", region_name=aws.region)

    items: List[dict] = []
    token: Optional[str] = None

    while True:
        params: Dict[str, object] = {"PageSize": run.page_size}
        if token:
            params["NextToken"] = token
        if run.reason_filter:
            # SES expects 'BOUNCE' or 'COMPLAINT'
            params["Reasons"] = [run.reason_filter]

        resp = client.list_suppressed_destinations(**params)  # type: ignore
        for it in resp.get("SuppressedDestinationSummaries", []) or []:
            items.append(
                {
                    "email": (it.get("EmailAddress") or "").strip(),
                    "reason": it.get("Reason"),
                    "last_update_time": it.get("LastUpdateTime").isoformat() if it.get("LastUpdateTime") else None,
                }
            )
            if run.max_total and len(items) >= run.max_total:
                return items

        token = resp.get("NextToken")
        if not token:
            break

    # normalize: drop empty emails
    items = [x for x in items if x.get("email")]
    return items


def write_jsonl(path: Path, rows: Iterable[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> List[dict]:
    rows: List[dict] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def csv_write(path: Path, headers: List[str], rows: Iterable[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in headers})


def db_fetch_user_emails(db: DbConfig) -> Dict[str, dict]:
    """
    Returns mapping: email_lower -> {email, user_id(optional), ...}
    We keep it minimal and fork-safe; user_id column name varies.
    """
    conn = pymysql.connect(
        host=db.host,
        port=db.port,
        user=db.user,
        password=db.password,
        database=db.database,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        read_timeout=20,
        write_timeout=20,
        connect_timeout=10,
    )
    try:
        where = f"WHERE {db.where_sql}" if db.where_sql.strip() else ""
        # Try to fetch id if exists; if not, fallback to email only
        # We cannot introspect cheaply without extra queries; do a safe SELECT with email only.
        sql = f"SELECT {db.email_column} AS email FROM {db.user_table} {where}"
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()

        out: Dict[str, dict] = {}
        for r in rows:
            email = (r.get("email") or "").strip()
            if not email:
                continue
            out[email.lower()] = {"email": email}
        return out
    finally:
        conn.close()


def diff_new(today_rows: List[dict], yesterday_rows: List[dict]) -> List[dict]:
    """
    Identify new suppressed emails today vs yesterday.
    Compare by email lower + reason (more precise).
    """
    yset = set((str(r.get("email", "")).lower(), r.get("reason")) for r in yesterday_rows)
    out = []
    for r in today_rows:
        key = (str(r.get("email", "")).lower(), r.get("reason"))
        if key not in yset:
            out.append(r)
    return out


def join_hits(ses_rows: List[dict], users: Dict[str, dict]) -> List[dict]:
    hits = []
    for r in ses_rows:
        e = str(r.get("email", "")).strip()
        if not e:
            continue
        u = users.get(e.lower())
        if u:
            hits.append(
                {
                    "email": e,
                    "reason": r.get("reason"),
                    "last_update_time": r.get("last_update_time"),
                    "user_email_raw": u.get("email"),
                }
            )
    return hits


def top_domains(rows: List[dict], topn: int = 20) -> List[Tuple[str, int]]:
    counter: Dict[str, int] = {}
    for r in rows:
        e = str(r.get("email", "")).strip()
        if "@" not in e:
            continue
        dom = e.split("@", 1)[1].lower()
        counter[dom] = counter.get(dom, 0) + 1
    return sorted(counter.items(), key=lambda x: x[1], reverse=True)[:topn]


def write_report_md(path: Path, *, ses_total: int, new_total: int, hit_total: int,
                    top_all: List[Tuple[str, int]], top_new: List[Tuple[str, int]],
                    sample_new: List[dict], sample_hits: List[dict]) -> None:
    def fmt_table(pairs: List[Tuple[str, int]]) -> str:
        if not pairs:
            return "_(none)_\n"
        lines = ["| 域名 | 数量 |", "|---|---:|"]
        for d, c in pairs:
            lines.append(f"| {d} | {c} |")
        return "\n".join(lines) + "\n"

    with path.open("w", encoding="utf-8") as f:
        f.write(f"# SES 抑制列表每日审计报告\n\n")
        f.write(f"- 生成时间（UTC）：{utc_now().isoformat()}\n")
        f.write(f"- 抑制列表总条目：**{ses_total}**\n")
        f.write(f"- 今日新增抑制：**{new_total}**\n")
        f.write(f"- 命中本地用户邮箱：**{hit_total}**\n\n")

        f.write("## Top 域名（全量）\n\n")
        f.write(fmt_table(top_all))

        f.write("## Top 域名（今日新增）\n\n")
        f.write(fmt_table(top_new))

        f.write("## 今日新增样本（最多 20 条）\n\n")
        for r in sample_new[:20]:
            f.write(f"- {r.get('email')} | {r.get('reason')} | {r.get('last_update_time')}\n")
        if not sample_new:
            f.write("_(none)_\n")
        f.write("\n")

        f.write("## 命中用户邮箱样本（最多 20 条）\n\n")
        for r in sample_hits[:20]:
            f.write(f"- {r.get('email')} | {r.get('reason')} | {r.get('last_update_time')}\n")
        if not sample_hits:
            f.write("_(none)_\n")
        f.write("\n")


def main() -> int:
    try:
        aws = get_aws_config()
        db = get_db_config()
        run = get_run_config()

        ensure_dir(run.out_dir)

        ymd = today_ymd(dt.timezone.utc)
        snap_path = run.out_dir / f"ses_suppression_{ymd}.jsonl"
        report_path = run.out_dir / f"report_{ymd}.md"
        hits_csv = run.out_dir / f"hits_{ymd}.csv"
        diff_csv = run.out_dir / f"diff_new_{ymd}.csv"

        # Find yesterday snapshot (UTC)
        yesterday = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1)).strftime("%Y%m%d")
        y_snap_path = run.out_dir / f"ses_suppression_{yesterday}.jsonl"
        yesterday_rows = read_jsonl(y_snap_path) if y_snap_path.exists() else []

        # 1) Pull SES suppression list
        ses_rows = ses_list_suppressed(aws, run)
        write_jsonl(snap_path, ses_rows)

        # 2) Diff new
        new_rows = diff_new(ses_rows, yesterday_rows)

        # 3) Fetch DB users
        users = db_fetch_user_emails(db)

        # 4) Join hits
        hits = join_hits(ses_rows, users)

        # 5) Outputs
        csv_write(
            hits_csv,
            headers=["email", "reason", "last_update_time", "user_email_raw"],
            rows=hits,
        )
        csv_write(
            diff_csv,
            headers=["email", "reason", "last_update_time"],
            rows=new_rows,
        )

        # 6) Report
        write_report_md(
            report_path,
            ses_total=len(ses_rows),
            new_total=len(new_rows),
            hit_total=len(hits),
            top_all=top_domains(ses_rows, 20),
            top_new=top_domains(new_rows, 20),
            sample_new=new_rows,
            sample_hits=hits,
        )

        print(f"[OK] snapshot: {snap_path}")
        print(f"[OK] report:   {report_path}")
        print(f"[OK] hits:     {hits_csv}")
        print(f"[OK] diff_new: {diff_csv}")
        return 0

    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
