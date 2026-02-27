#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SES Suppression Viewer (FastAPI)
- 列表：分页 + 缓存 + 批量 join（v2_user）
- 排序：按用户注册时间 created_at asc/desc（仅对命中用户有效；未命中用户会排在后面）
- 写操作：一键禁用命中用户（v2_user.banned=1），用 ADMIN_TOKEN 保护

Env (EnvironmentFile .env):
  AWS_REGION=us-east-1
  AWS_ACCESS_KEY_ID=...
  AWS_SECRET_ACCESS_KEY=...
  DB_HOST=127.0.0.1
  DB_PORT=3306
  DB_USER=...
  DB_PASSWORD=...
  DB_NAME=...
  DB_USER_TABLE=v2_user
  MAX_PAGE_SIZE=200
  CACHE_TTL_SECONDS=60
  ADMIN_TOKEN= (可选，未设置则禁用写操作)
  CURSOR_SIGNING_KEY= (可选，用于 next_token 签名；未设置则自动用 DB_PASSWORD 作为 fallback)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import boto3
import pymysql
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field

APP_DIR = os.path.dirname(os.path.abspath(__file__))

# ========== Config ==========
AWS_REGION = os.getenv("AWS_REGION", "us-east-1").strip()

DB_HOST = os.getenv("DB_HOST", "127.0.0.1").strip()
DB_PORT = int(os.getenv("DB_PORT", "3306").strip())
DB_USER = os.getenv("DB_USER", "").strip()
DB_PASSWORD = os.getenv("DB_PASSWORD", "").strip()
DB_NAME = os.getenv("DB_NAME", "").strip()
DB_USER_TABLE = os.getenv("DB_USER_TABLE", "v2_user").strip()

# 注意：你 .env 之前出现过“粘连”导致 int() 失败，这里加更稳健的解析
def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "")
    if not raw:
        return default
    # 只取开头连续数字，避免 "200CURSOR..." 这种粘连炸掉
    s = ""
    for ch in raw.strip():
        if ch.isdigit():
            s += ch
        else:
            break
    return int(s) if s else default

MAX_PAGE_SIZE = _int_env("MAX_PAGE_SIZE", 200)
CACHE_TTL_SECONDS = _int_env("CACHE_TTL_SECONDS", 60)

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()

CURSOR_SIGNING_KEY = os.getenv("CURSOR_SIGNING_KEY", "").strip()
if not CURSOR_SIGNING_KEY:
    # fallback：用 DB_PASSWORD（你本来就存在本机），保证 systemd 不会因为没配 key 就起不来
    CURSOR_SIGNING_KEY = (DB_PASSWORD or "fallback-signing-key")

INDEX_HTML_PATH = os.path.join(APP_DIR, "index.html")
PUBLIC_INDEX_HTML_PATH = os.path.join(APP_DIR, "public", "index.html")

# ========== App ==========
app = FastAPI(title="SES Suppression Viewer", version="1.2")
app.add_middleware(GZipMiddleware, minimum_size=1024)

# ========== Simple in-memory cache ==========
@dataclass
class CacheItem:
    ts: int
    value: Any

_CACHE: Dict[str, CacheItem] = {}

def cache_get(key: str) -> Optional[Any]:
    it = _CACHE.get(key)
    if not it:
        return None
    if int(time.time()) - it.ts > CACHE_TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return it.value

def cache_set(key: str, value: Any) -> None:
    _CACHE[key] = CacheItem(ts=int(time.time()), value=value)

def now_cn_iso() -> str:
    # 只用于展示，ISO +08:00
    dt = datetime.now(timezone.utc).astimezone()
    return dt.isoformat()

# ========== Cursor encode/decode (signed) ==========
def _b64url_encode(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("utf-8")

def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))

def encode_cursor(payload: Dict[str, Any]) -> str:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    sig = hmac.new(CURSOR_SIGNING_KEY.encode("utf-8"), body, hashlib.sha256).digest()
    return _b64url_encode(body) + "." + _b64url_encode(sig)

def decode_cursor(token: str) -> Dict[str, Any]:
    try:
        body_b64, sig_b64 = token.split(".", 1)
        body = _b64url_decode(body_b64)
        sig = _b64url_decode(sig_b64)
        exp = hmac.new(CURSOR_SIGNING_KEY.encode("utf-8"), body, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, exp):
            raise ValueError("bad signature")
        return json.loads(body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid cursor")

# ========== DB helpers ==========
def get_db_conn():
    if not (DB_USER and DB_PASSWORD and DB_NAME):
        raise HTTPException(status_code=500, detail="DB config missing")
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        db=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )

def fetch_users_by_emails(emails: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    批量 join：用 email 精确匹配 v2_user.email
    返回 dict[email_lower] -> user row
    """
    if not emails:
        return {}
    # 去重、lower
    uniq = sorted({e.strip().lower() for e in emails if e and "@" in e})
    if not uniq:
        return {}

    placeholders = ",".join(["%s"] * len(uniq))
    sql = f"""
      SELECT id, email, banned, created_at, last_login_ip
      FROM `{DB_USER_TABLE}`
      WHERE LOWER(email) IN ({placeholders})
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, uniq)
            rows = cur.fetchall() or []
    finally:
        conn.close()

    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        em = (r.get("email") or "").strip().lower()
        if em:
            out[em] = r
    return out

def disable_user_by_id(user_id: int) -> None:
    sql = f"UPDATE `{DB_USER_TABLE}` SET banned=1 WHERE id=%s"
    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (int(user_id),))
    finally:
        conn.close()

# ========== AWS SES client ==========
def get_ses_client(region: str):
    return boto3.client("sesv2", region_name=region)

def list_suppressed(region: str, reason: str, q: str, cursor: Optional[str], page_size: int) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    从 SES 拉一页（PageSize<=MAX_PAGE_SIZE），做本地 contains 过滤（q），并返回 next_token。
    注意：SES list_suppressed_dests 的过滤能力有限，contains 只能本地做。
    """
    c = get_ses_client(region)

    kwargs: Dict[str, Any] = {"PageSize": page_size}
    if reason and reason != "ALL":
        kwargs["Reason"] = reason
    if cursor:
        payload = decode_cursor(cursor)
        # 防串页：确保 region/reason 一致
        if payload.get("region") != region or payload.get("reason") != reason:
            raise HTTPException(status_code=400, detail="cursor mismatch (region/reason)")
        nt = payload.get("next_token")
        if nt:
            kwargs["NextToken"] = nt

    resp = c.list_suppressed_destinations(**kwargs)
    items = resp.get("SuppressedDestinationSummaries") or []
    next_token = resp.get("NextToken")

    # contains 过滤（大小写不敏感）
    qn = (q or "").strip().lower()
    if qn:
        items = [it for it in items if qn in (it.get("EmailAddress") or "").lower()]

    rows: List[Dict[str, Any]] = []
    for it in items:
        rows.append(
            {
                "email": it.get("EmailAddress"),
                "reason": it.get("Reason"),
                "last_update_time": (it.get("LastUpdateTime").astimezone().isoformat() if it.get("LastUpdateTime") else None),
            }
        )

    # 把 AWS next_token 封装成我们自己的签名 cursor（避免前端直接持有 AWS token）
    next_cursor = None
    if next_token:
        next_cursor = encode_cursor(
            {
                "v": 1,
                "next_token": next_token,
                "region": region,
                "reason": reason,
                "ts": int(time.time()),
            }
        )
    return rows, next_cursor

# ========== Routes ==========
@app.get("/", response_class=HTMLResponse)
def index():
    # 兼容两种路径：scripts/index.html 或 scripts/public/index.html
    path = INDEX_HTML_PATH if os.path.exists(INDEX_HTML_PATH) else PUBLIC_INDEX_HTML_PATH
    if not os.path.exists(path):
        return HTMLResponse("<h1>index.html not found</h1>", status_code=404)
    with open(path, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())

@app.get("/health")
def health():
    return {"ok": True, "ts": int(time.time()), "region": AWS_REGION}

class DisableReq(BaseModel):
    user_id: int = Field(..., ge=1)
    email: Optional[str] = None

@app.post("/api/users/disable")
def api_disable_user(payload: DisableReq, x_admin_token: Optional[str] = Header(default=None)):
    # 写操作保护
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="ADMIN_TOKEN not configured")
    if not x_admin_token or x_admin_token.strip() != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

    # 可选：如果带 email，则做一次简单一致性校验
    if payload.email:
        em = payload.email.strip().lower()
        if "@" not in em:
            raise HTTPException(status_code=400, detail="bad email")
        u = fetch_users_by_emails([em]).get(em)
        if not u or int(u.get("id") or 0) != int(payload.user_id):
            raise HTTPException(status_code=400, detail="user_id/email mismatch")

    disable_user_by_id(int(payload.user_id))
    # 清缓存：禁用会影响列表的 banned 字段
    _CACHE.clear()
    return {"ok": True, "user_id": int(payload.user_id)}

@app.get("/api/ses/suppressions")
def api_list_suppressions(
    reason: str = "ALL",
    q: str = "",
    hit_only: int = 0,
    cursor: Optional[str] = None,
    page_size: int = 50,
    region: Optional[str] = None,
    sort_created_at: str = "desc",  # asc|desc
):
    region = (region or AWS_REGION).strip()
    reason = (reason or "ALL").strip().upper()
    q = (q or "").strip()
    hit_only = 1 if str(hit_only) in ("1", "true", "True") else 0

    if reason not in ("ALL", "BOUNCE", "COMPLAINT"):
        raise HTTPException(status_code=400, detail="bad reason")

    sort_created_at = (sort_created_at or "desc").strip().lower()
    if sort_created_at not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="bad sort_created_at")

    ps = max(1, min(int(page_size), MAX_PAGE_SIZE))

    # cache key（cursor 不缓存：cursor 翻页是 stateful，缓存价值小且容易混淆）
    cache_key = None
    if not cursor:
        cache_key = f"list|{region}|{reason}|{q}|{hit_only}|{ps}|{sort_created_at}"
        cached = cache_get(cache_key)
        if cached:
            return cached

    rows, next_cursor = list_suppressed(region, reason, q, cursor, ps)

    # join users（批量）
    emails = [r["email"] for r in rows if r.get("email")]
    users_map = fetch_users_by_emails(emails)

    out_rows: List[Dict[str, Any]] = []
    for r in rows:
        em = (r.get("email") or "").strip().lower()
        u = users_map.get(em)
        hit = bool(u)
        if hit_only and not hit:
            continue
        out_rows.append(
            {
                **r,
                "hit_user": hit,
                "user_id": (int(u["id"]) if u else None),
                "user_email": (u.get("email") if u else None),
                "user_banned": (int(u.get("banned") or 0) if u else None),
                "user_created_at": (int(u.get("created_at") or 0) if u else None),
                "user_last_login_ip": (u.get("last_login_ip") if u else None),
            }
        )

    # 排序：命中用户按 created_at 排序；未命中用户统一排到后面
    def sort_key(item: Dict[str, Any]) -> Tuple[int, int]:
        hit = 1 if item.get("hit_user") else 0
        created = int(item.get("user_created_at") or 0)
        # 先按 hit 降序（命中在前），再按 created
        return (hit, created)

    reverse = True if sort_created_at == "desc" else False
    out_rows.sort(key=sort_key, reverse=reverse)

    payload = {"ok": True, "region": region, "count": len(out_rows), "next_token": next_cursor, "rows": out_rows}

    if cache_key:
        cache_set(cache_key, payload)
    return JSONResponse(payload)
