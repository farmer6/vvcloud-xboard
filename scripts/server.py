#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SES Suppression List Viewer (FastAPI)
- 读取 SESv2 抑制列表（ListSuppressedDestinations / GetSuppressedDestination）
- 与 XBoard(v2_user) 做批量 join（email 命中）
- 提供分页、搜索、reason 过滤、只看命中用户
- 提供内存缓存（AWS 拉取缓存 + DB email->user 缓存）
- 不依赖 cryptography/Fernet：cursor 采用 HMAC 签名的 base64 token（防篡改）
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import boto3
import pymysql
from fastapi import Body, FastAPI, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ----------------------------
# 配置读取（来自 systemd EnvironmentFile=.env）
# ----------------------------

AWS_REGION = os.getenv("AWS_REGION", "us-east-1").strip()
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()

DB_HOST = os.getenv("DB_HOST", "127.0.0.1").strip()
DB_PORT = int(os.getenv("DB_PORT", "3306").strip())
DB_USER = os.getenv("DB_USER", "").strip()
DB_PASSWORD = os.getenv("DB_PASSWORD", "").strip()
DB_NAME = os.getenv("DB_NAME", "").strip()
DB_USER_TABLE = os.getenv("DB_USER_TABLE", "v2_user").strip()

# 用于 cursor 签名（务必设置一个随机长串；不设置就用 DB_PASSWORD 做兜底，但不推荐）
CURSOR_SIGNING_KEY = (os.getenv("CURSOR_SIGNING_KEY", "") or DB_PASSWORD or "change-me").encode("utf-8")

# 缓存参数
AWS_CACHE_TTL_SEC = int(os.getenv("AWS_CACHE_TTL_SEC", "300"))       # AWS 列表缓存 5 分钟
DB_EMAIL_CACHE_TTL_SEC = int(os.getenv("DB_EMAIL_CACHE_TTL_SEC", "600"))  # email->user 缓存 10 分钟
FULL_CACHE_TTL_SEC = int(os.getenv("FULL_CACHE_TTL_SEC", "1800"))    # 全量缓存 30 分钟
MAX_PAGE_SIZE = int(os.getenv("MAX_PAGE_SIZE", "200"))
DEFAULT_PAGE_SIZE = int(os.getenv("DEFAULT_PAGE_SIZE", "200"))

# 前端文件路径：scripts/public/index.html
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
INDEX_HTML_PATH = os.path.join(PUBLIC_DIR, "index.html")


# ----------------------------
# 工具：时间与 cursor
# ----------------------------

def _now_ts() -> int:
    return int(time.time())

def _iso(dt: datetime) -> str:
    # boto3 返回的 datetime 通常是 tz-aware（UTC）；这里统一输出带时区的 ISO
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone().isoformat()

def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")

def _b64url_decode(s: str) -> bytes:
    pad = "=" * ((4 - (len(s) % 4)) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))

def _sign(payload_b64: str) -> str:
    sig = hmac.new(CURSOR_SIGNING_KEY, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return _b64url_encode(sig)

def encode_cursor(obj: Dict[str, Any]) -> str:
    payload = _b64url_encode(json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    sig = _sign(payload)
    return f"{payload}.{sig}"

def decode_cursor(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload, sig = token.split(".", 1)
        if not hmac.compare_digest(_sign(payload), sig):
            return None
        data = json.loads(_b64url_decode(payload).decode("utf-8"))
        if not isinstance(data, dict):
            return None
        return data
    except Exception:
        return None


# ----------------------------
# 简单 TTL 缓存
# ----------------------------

@dataclass
class CacheItem:
    exp: int
    val: Any

class TTLCache:
    def __init__(self, max_items: int = 512):
        self.max_items = max_items
        self._d: Dict[str, CacheItem] = {}

    def get(self, k: str) -> Any:
        it = self._d.get(k)
        if not it:
            return None
        if it.exp < _now_ts():
            self._d.pop(k, None)
            return None
        return it.val

    def set(self, k: str, v: Any, ttl: int) -> None:
        # 简单淘汰：超限就清一半（够用即可）
        if len(self._d) >= self.max_items:
            keys = list(self._d.keys())
            for kk in keys[: len(keys)//2]:
                self._d.pop(kk, None)
        self._d[k] = CacheItem(exp=_now_ts() + ttl, val=v)

AWS_CACHE = TTLCache(max_items=256)
DB_EMAIL_CACHE = TTLCache(max_items=2048)
FULL_LIST_CACHE = TTLCache(max_items=4)


# ----------------------------
# AWS / DB 访问
# ----------------------------

def _ses_client(region: str):
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        return boto3.client(
            "sesv2",
            region_name=region,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        )
    # 允许走默认链路（例如 EC2 role / 环境变量）
    return boto3.client("sesv2", region_name=region)

def list_suppressed_destinations(region: str, reason: str, page_size: int, next_token: Optional[str]) -> Dict[str, Any]:
    c = _ses_client(region)
    kwargs: Dict[str, Any] = {"PageSize": page_size}
    if next_token:
        kwargs["NextToken"] = next_token
    # reason: ALL/BOUNCE/COMPLAINT
    if reason and reason != "ALL":
        kwargs["Reasons"] = [reason]
    return c.list_suppressed_destinations(**kwargs)

def db_connect():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )

def db_fetch_users_by_emails(emails: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    批量取用户信息；返回 mapping: normalized_email(lower) -> row
    说明：大多数 MySQL/MariaDB 邮箱字段默认是 case-insensitive collation，
          这里仍做 lower 归一，避免 SES 列表里有大小写导致匹配失败。
    """
    if not emails:
        return {}

    # 先用缓存命中（email->user）
    now = _now_ts()
    out: Dict[str, Dict[str, Any]] = {}
    missing: List[str] = []

    for e in emails:
        k = e.lower()
        cached = DB_EMAIL_CACHE.get(k)
        if cached is not None:
            if cached:  # {} 表示不存在
                out[k] = cached
        else:
            missing.append(e)

    if not missing:
        return out

    # 由于可能存在大小写差异，统一按 lower 做 IN
    lower_missing = sorted({m.lower() for m in missing})
    placeholders = ",".join(["%s"] * len(lower_missing))

    sql = f"""
SELECT id, email, banned, created_at, last_login_ip
FROM {DB_USER_TABLE}
WHERE LOWER(email) IN ({placeholders})
LIMIT {len(lower_missing)}
""".strip()

    rows: List[Dict[str, Any]] = []
    conn = db_connect()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, lower_missing)
            rows = cur.fetchall() or []
    finally:
        conn.close()

    found = {str(r["email"]).lower(): r for r in rows}

    # 写缓存：存在与不存在都缓存
    for k in lower_missing:
        DB_EMAIL_CACHE.set(k, found.get(k, {}), DB_EMAIL_CACHE_TTL_SEC)

    # 合并输出
    out.update({k: v for k, v in found.items()})
    return out


# ----------------------------
# FastAPI
# ----------------------------

app = FastAPI(title="SES Suppression Viewer", version="1.2")
app.add_middleware(GZipMiddleware, minimum_size=1024)

# 静态资源：/assets 之类（如果你未来有）
if os.path.isdir(PUBLIC_DIR):
    app.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
def index():
    # 修复：index.html 在 scripts/public/index.html
    if not os.path.exists(INDEX_HTML_PATH):
        return HTMLResponse("<h1>index.html not found</h1>", status_code=404)
    with open(INDEX_HTML_PATH, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/health")
def health():
    return {"ok": True, "ts": _now_ts(), "region": AWS_REGION}


def _aws_cache_key(region: str, reason: str, page_size: int, next_token: Optional[str]) -> str:
    token_hash = hashlib.sha1((next_token or "").encode("utf-8")).hexdigest()
    return f"aws:{region}:{reason}:{page_size}:{token_hash}"

def _full_cache_key(region: str) -> str:
    return f"full:{region}"

def _build_rows_from_summaries(summaries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    emails: List[str] = []
    rows_raw: List[Dict[str, Any]] = []
    for it in summaries:
        email = str(it.get("EmailAddress") or "").strip()
        if not email:
            continue
        rows_raw.append(it)
        emails.append(email)

    user_map = db_fetch_users_by_emails(emails)

    out_rows: List[Dict[str, Any]] = []
    for it in rows_raw:
        email = str(it.get("EmailAddress") or "").strip()
        reason0 = str(it.get("Reason") or "").strip().upper()
        lut = it.get("LastUpdateTime")
        if isinstance(lut, datetime):
            lut_s = _iso(lut)
        else:
            lut_s = str(lut) if lut else None

        u = user_map.get(email.lower())
        hit = bool(u)

        out_rows.append(
            {
                "email": email,
                "reason": reason0,
                "last_update_time": lut_s,
                "hit_user": hit,
                "user_id": int(u["id"]) if hit else None,
                "user_email": u.get("email") if hit else None,
                "user_banned": int(u.get("banned") or 0) if hit else None,
                "user_created_at": int(u.get("created_at") or 0) if hit else None,
                "user_last_login_ip": u.get("last_login_ip") if hit else None,
            }
        )
    return out_rows

def _fetch_all_summaries(region: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    summaries: List[Dict[str, Any]] = []
    next_token: Optional[str] = None
    while True:
        try:
            resp = list_suppressed_destinations(region, "ALL", MAX_PAGE_SIZE, next_token)
        except Exception as e:
            return None, f"{type(e).__name__}: {e}"
        part = resp.get("SuppressedDestinationSummaries") or []
        summaries.extend(part)
        next_token = resp.get("NextToken") or None
        if not next_token:
            break
    return summaries, None

def _get_full_rows(region: str) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str]]:
    ckey = _full_cache_key(region)
    cached = FULL_LIST_CACHE.get(ckey)
    if cached is not None:
        return cached.get("rows") or [], None

    summaries, err = _fetch_all_summaries(region)
    if err:
        return None, err
    rows = _build_rows_from_summaries(summaries or [])
    FULL_LIST_CACHE.set(ckey, {"rows": rows, "fetched_at": _now_ts()}, FULL_CACHE_TTL_SEC)
    return rows, None

def _sort_rows(rows: List[Dict[str, Any]], sort_order: str) -> List[Dict[str, Any]]:
    order = (sort_order or "desc").lower()
    if order not in ("asc", "desc"):
        order = "desc"
    if order == "asc":
        def key(r: Dict[str, Any]):
            if r.get("hit_user") and r.get("user_created_at"):
                return (0, int(r["user_created_at"]))
            return (1, 0)
    else:
        def key(r: Dict[str, Any]):
            if r.get("hit_user") and r.get("user_created_at"):
                return (0, -int(r["user_created_at"]))
            return (1, 0)
    return sorted(rows, key=key)

def _estimate_size(obj: Any, seen: Optional[set] = None) -> int:
    # Rough in-process size estimate for debug only.
    if seen is None:
        seen = set()
    oid = id(obj)
    if oid in seen:
        return 0
    seen.add(oid)
    size = sys.getsizeof(obj)
    if isinstance(obj, dict):
        for k, v in obj.items():
            size += _estimate_size(k, seen)
            size += _estimate_size(v, seen)
    elif isinstance(obj, (list, tuple, set)):
        for it in obj:
            size += _estimate_size(it, seen)
    return size

def _list_core(
    region: str,
    reason: str,
    q: str,
    hit_only: bool,
    cursor: Optional[str],
    page_size: int,
    sort_order: str,
) -> Dict[str, Any]:
    region = (region or AWS_REGION).strip()
    reason = (reason or "ALL").strip().upper()
    q = (q or "").strip().lower()
    page_size = max(1, min(int(page_size), MAX_PAGE_SIZE))

    offset = 0
    if cursor:
        obj = decode_cursor(cursor)
        if not obj or obj.get("v") != 2:
            return {"ok": False, "error": "INVALID_CURSOR", "hint": "cursor 无效或已被篡改"}
        if obj.get("region") != region or obj.get("reason") != reason or obj.get("q") != q or obj.get("hit_only") != hit_only or obj.get("sort") != sort_order:
            return {"ok": False, "error": "INVALID_CURSOR", "hint": "cursor 与当前筛选条件不匹配"}
        offset = int(obj.get("offset") or 0)

    full_rows, err = _get_full_rows(region)
    if err:
        return {"ok": False, "error": "AWS_ERROR", "message": err, "region": region}

    filtered: List[Dict[str, Any]] = []
    for r in full_rows or []:
        if reason != "ALL" and r.get("reason") != reason:
            continue
        if q and q not in str(r.get("email") or "").lower():
            continue
        if hit_only and not r.get("hit_user"):
            continue
        filtered.append(r)

    sorted_rows = _sort_rows(filtered, sort_order)
    page_rows = sorted_rows[offset: offset + page_size]
    next_offset = offset + page_size
    out_cursor = None
    if next_offset < len(sorted_rows):
        out_cursor = encode_cursor(
            {
                "v": 2,
                "offset": next_offset,
                "region": region,
                "reason": reason,
                "q": q,
                "hit_only": hit_only,
                "sort": sort_order,
            }
        )

    return {
        "ok": True,
        "region": region,
        "count": len(page_rows),
        "next_token": out_cursor,   # 注意：这里返回的是“签名后的 cursor”，不是 AWS 原始 NextToken
        "rows": page_rows,
    }


@app.get("/api/ses/suppressions")
def api_suppressions(
    region: str = Query(default=AWS_REGION),
    reason: str = Query(default="ALL", description="ALL / BOUNCE / COMPLAINT"),
    q: str = Query(default="", description="搜索邮箱关键字（contains）"),
    hit_only: bool = Query(default=False, description="只看命中用户"),
    cursor: Optional[str] = Query(default=None, description="分页游标（由 next_token 返回）"),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    sort_order: str = Query(default="desc", description="注册时间排序：asc / desc"),
):
    data = _list_core(
        region=region,
        reason=reason,
        q=q,
        hit_only=hit_only,
        cursor=cursor,
        page_size=page_size,
        sort_order=sort_order,
    )
    # 失败时统一 200 但 ok=false（方便前端显示错误信息）
    return JSONResponse(data, status_code=200)


@app.post("/api/users/ban")
def api_ban_user(user_id: int = Body(..., embed=True, ge=1)):
    """
    一键禁用命中用户：将 v2_users/v2_user 的 banned 置为 1
    """
    sql = f"UPDATE {DB_USER_TABLE} SET banned=1 WHERE id=%s"
    conn = db_connect()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id,))
            changed = cur.rowcount or 0
    finally:
        conn.close()
    ckey = _full_cache_key(AWS_REGION)
    cached = FULL_LIST_CACHE.get(ckey)
    if cached and cached.get("rows"):
        for r in cached["rows"]:
            if r.get("user_id") == user_id:
                r["user_banned"] = 1
    return {"ok": True, "user_id": user_id, "updated": changed}

@app.get("/api/debug/config")
def debug_config():
    # 方便你确认 systemd 读到了哪些配置（不要暴露敏感信息）
    full_rows = None
    full_rows_bytes = None
    ckey = _full_cache_key(AWS_REGION)
    cached = FULL_LIST_CACHE.get(ckey)
    if cached and cached.get("rows"):
        full_rows = cached["rows"]
        full_rows_bytes = _estimate_size(full_rows)
    return {
        "ok": True,
        "AWS_REGION": AWS_REGION,
        "DB_HOST": DB_HOST,
        "DB_PORT": DB_PORT,
        "DB_NAME": DB_NAME,
        "DB_USER_TABLE": DB_USER_TABLE,
        "AWS_CACHE_TTL_SEC": AWS_CACHE_TTL_SEC,
        "DB_EMAIL_CACHE_TTL_SEC": DB_EMAIL_CACHE_TTL_SEC,
        "FULL_CACHE_TTL_SEC": FULL_CACHE_TTL_SEC,
        "MAX_PAGE_SIZE": MAX_PAGE_SIZE,
        "FULL_CACHE_ROWS": len(full_rows) if full_rows is not None else None,
        "FULL_CACHE_BYTES_EST": full_rows_bytes,
        "PUBLIC_DIR": PUBLIC_DIR,
        "INDEX_HTML_PATH": INDEX_HTML_PATH,
        "has_access_key": bool(AWS_ACCESS_KEY_ID),
        "has_secret_key": bool(AWS_SECRET_ACCESS_KEY),
        "has_cursor_signing_key": bool(os.getenv("CURSOR_SIGNING_KEY", "")),
    }
