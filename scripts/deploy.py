#!/usr/bin/env python3
"""Deploy VibeChat to Sunny's Bytenex Cloudflare account (contact@bytenex.io).

Uses the stored custom.cloudflare credential (surrogate) — no raw keys in
this file or anywhere in the repo. WABA credentials are NOT handled here:
they live in the D1 `waba_settings` row, written separately.

Flow (proven pattern from bytenex-site): create/reuse D1 -> apply schema ->
bundle worker with esbuild -> PUT bare worker -> assets-upload-session ->
upload buckets -> PUT worker with assets JWT + bindings -> attach custom
domain vibechat.bytenex.io -> print the generated webhook verify token.

Usage: python3 scripts/deploy.py [waba_id]
"""
import base64
import hashlib
import json
import mimetypes
import os
import secrets
import subprocess
import sys
import urllib.request
import urllib.error

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response, DynamicCredentialError

BASE = "https://api.cloudflare.com/client/v4"
ALLOWED = ("api.cloudflare.com",)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT_NAME = "wibechat"
ACCOUNT_ID_EXPECTED = "6945667bc2f663e9c5f807238bfe76db"  # Contact@bytenex.io's Account
CUSTOM_DOMAIN = "vibechat.bytenex.io"
D1_NAME = "waba-db"
R2_NAME = "waba-media"


class DeployError(Exception):
    pass


def cf_request(method, path, body=None, content_type="application/json", bearer_jwt=None):
    req = urllib.request.Request(
        BASE + path,
        data=body if isinstance(body, bytes) else (json.dumps(body).encode() if body is not None else None),
        method=method)
    if body is not None:
        req.add_header("Content-Type", content_type)
    if bearer_jwt is not None:
        req.add_header("Authorization", f"Bearer {bearer_jwt}")
    else:
        try:
            add_surrogate_to_request(req, "custom.cloudflare",
                                     entry_name="access_token", allowed_hosts=ALLOWED)
        except DynamicCredentialError as e:
            raise DeployError(f"credential error: {e}")
    try:
        resp = urllib.request.urlopen(req, timeout=120)
    except urllib.error.HTTPError as e:
        raise DeployError(f"API {method} {path} -> HTTP {e.code}: "
                          f"{e.read().decode('utf-8', errors='replace')[:800]}")
    ctype = resp.headers.get("Content-Type", "")
    raw = resp.read()
    if "application/json" in ctype:
        payload = json.loads(raw.decode())
        if isinstance(payload, dict) and payload.get("success") is False:
            raise DeployError(f"API {method} {path} failed: {json.dumps(payload.get('errors'))}")
        return payload.get("result")
    return raw


def api(method, path, body=None):
    return cf_request(method, path, body)


def step(msg):
    print(f"\n==> {msg}", flush=True)


def ok(msg):
    print(f"    [ok] {msg}", flush=True)


def warn(msg):
    print(f"    [warn] {msg}", flush=True)


def encode_multipart(parts):
    boundary = "----vibechat" + secrets.token_hex(8)
    buf = bytearray()
    for name, filename, ctype, data in parts:
        buf += f"--{boundary}\r\n".encode()
        buf += (f'Content-Disposition: form-data; name="{name}"; '
                f'filename="{filename}"\r\n').encode()
        buf += f"Content-Type: {ctype}\r\n\r\n".encode()
        buf += data + b"\r\n"
    buf += f"--{boundary}--\r\n".encode()
    return bytes(buf), boundary


# ---------------------------------------------------------------- D1
def ensure_d1(account_id):
    dbs = api("GET", f"/accounts/{account_id}/d1/database?per_page=100") or []
    for db in dbs:
        if db.get("name") == D1_NAME:
            ok(f"D1 '{D1_NAME}' exists: {db['uuid']}")
            return db["uuid"]
    created = api("POST", f"/accounts/{account_id}/d1/database", {"name": D1_NAME})
    ok(f"D1 '{D1_NAME}' created: {created['uuid']}")
    return created["uuid"]


def d1_query(account_id, db_id, sql, params=None):
    body = {"sql": sql}
    if params is not None:
        body["params"] = params
    return api("POST", f"/accounts/{account_id}/d1/database/{db_id}/query", body)


def apply_schema(account_id, db_id):
    with open(os.path.join(ROOT, "schema.sql"), encoding="utf-8") as f:
        raw = f.read()
    lines = [ln for ln in raw.splitlines() if not ln.strip().startswith("--")]
    stmts = [s.strip() for s in "\n".join(lines).split(";") if s.strip()]
    for i, stmt in enumerate(stmts):
        d1_query(account_id, db_id, stmt)
    ok(f"schema applied ({len(stmts)} statements)")


def seed_settings(account_id, db_id, waba_id):
    # Preserve an already-generated private verify token across redeploys;
    # only replace the repo's public seed token (or an empty one).
    rows = d1_query(account_id, db_id,
                    "SELECT verify_token FROM waba_settings WHERE id = 'default'")
    current = rows[0]["results"][0]["verify_token"] if rows and rows[0].get("results") else None
    if current and current != "bytenex_waba_" + "verify_2026":
        verify_token = current
        d1_query(account_id, db_id,
                 "UPDATE waba_settings SET waba_id = COALESCE(?, waba_id), business_name = 'Bytenex Business' WHERE id = 'default'",
                 [waba_id])
        ok("waba_settings: existing private verify token preserved, WABA ID set")
    else:
        verify_token = "vibe_" + secrets.token_urlsafe(24)
        d1_query(
            account_id, db_id,
            "UPDATE waba_settings SET verify_token = ?, waba_id = COALESCE(?, waba_id), business_name = 'Bytenex Business' WHERE id = 'default'",
            [verify_token, waba_id],
        )
        ok("waba_settings seeded (fresh verify token generated, WABA ID set)")
    return verify_token


# ---------------------------------------------------------------- R2
def try_create_r2(account_id):
    try:
        api("POST", f"/accounts/{account_id}/r2/buckets", {"name": R2_NAME})
        ok(f"R2 bucket '{R2_NAME}' created")
        return True
    except DeployError as e:
        warn(f"R2 bucket not created ({str(e)[:160]}...) — deploying without R2 binding; "
             "media upload falls back to data URLs until the token gets R2 access or the bucket is created in the dashboard")
        return False


# ---------------------------------------------------------------- worker
def bundle_worker():
    out = os.path.join(ROOT, ".deploy", "worker.mjs")
    proc = subprocess.run(
        [os.path.join(ROOT, "node_modules", ".bin", "esbuild"),
         os.path.join(ROOT, "src", "worker", "index.ts"),
         "--bundle", "--format=esm", "--platform=neutral",
         f"--outfile={out}"],
        cwd=ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        raise DeployError(f"esbuild failed: {proc.stdout} {proc.stderr}")
    with open(out, "rb") as f:
        src = f.read()
    ok(f"worker bundled ({len(src)} bytes)")
    return src


def put_worker(account_id, worker_src, db_id, with_assets_jwt=None, with_r2=False, with_email=True):
    bindings = [
        {"type": "d1", "name": "DB", "id": db_id},
        {"type": "plain_text", "name": "ADMIN_EMAIL", "text": "contact@bytenex.io"},
        {"type": "plain_text", "name": "ENVIRONMENT", "text": "production"},
    ]
    if with_r2:
        bindings.append({"type": "r2_bucket", "name": "MEDIA_BUCKET", "bucket_name": R2_NAME})
    if with_email:
        bindings.append({"type": "send_email", "name": "EMAIL"})
    metadata = {
        "main_module": "worker.mjs",
        "compatibility_date": "2024-11-01",
        "compatibility_flags": ["nodejs_compat"],
        "bindings": bindings,
    }
    if with_assets_jwt:
        bindings.append({"type": "assets", "name": "ASSETS"})
        # SPA fallback for non-asset paths (deep links / refresh) — without
        # this, ASSETS.fetch 404s instead of serving index.html.
        # (Deliberately NOT run_worker_first — that caused 1042s in 2026-10-15.)
        metadata["assets"] = {"jwt": with_assets_jwt,
                              "config": {"not_found_handling": "single-page-application"}}
    parts = [
        ("metadata", "metadata.json", "application/json", json.dumps(metadata).encode()),
        ("worker.mjs", "worker.mjs", "application/javascript+module", worker_src),
    ]
    body, boundary = encode_multipart(parts)
    cf_request("PUT", f"/accounts/{account_id}/workers/scripts/{SCRIPT_NAME}",
               body=body, content_type=f"multipart/form-data; boundary={boundary}")
    ok(f"worker '{SCRIPT_NAME}' uploaded"
       + (" (with assets)" if with_assets_jwt else " (bare)"))


def build_asset_manifest():
    dist = os.path.join(ROOT, "dist")
    entries = []
    for root, _dirs, names in os.walk(dist):
        for fn in names:
            full = os.path.join(root, fn)
            rel = "/" + os.path.relpath(full, dist).replace(os.sep, "/")
            entries.append((rel, full))
    manifest, files_by_hash = {}, {}
    for rel, full in sorted(entries):
        with open(full, "rb") as f:
            content = f.read()
        ext = os.path.splitext(full)[1].lstrip(".").lower()
        h = hashlib.sha256(base64.b64encode(content) + ext.encode()).hexdigest()[:32]
        manifest[rel] = {"hash": h, "size": len(content)}
        ctype = mimetypes.guess_type(rel)[0] or "application/octet-stream"
        files_by_hash[h] = (rel, content, ctype)
    return manifest, files_by_hash


def upload_static_assets(account_id):
    manifest, files_by_hash = build_asset_manifest()
    session = api("POST",
                  f"/accounts/{account_id}/workers/scripts/{SCRIPT_NAME}/assets-upload-session",
                  {"manifest": manifest})
    session_jwt = session["jwt"]
    buckets = session.get("buckets") or []
    ok(f"assets session opened ({len(manifest)} files, {len(buckets)} buckets)")
    completion_jwt = session_jwt
    for i, bucket in enumerate(buckets):
        parts = []
        for file_hash in bucket:
            rel, content, ctype = files_by_hash[file_hash]
            parts.append((file_hash, file_hash, ctype, base64.b64encode(content)))
        body, boundary = encode_multipart(parts)
        result = cf_request(
            "POST", f"/accounts/{account_id}/workers/assets/upload?base64=true",
            body=body,
            content_type=f"multipart/form-data; boundary={boundary}",
            bearer_jwt=session_jwt)
        got_jwt = isinstance(result, dict) and bool(result.get("jwt"))
        if got_jwt:
            completion_jwt = result["jwt"]
        ok(f"assets bucket {i + 1}/{len(buckets)} uploaded ({len(bucket)} files, jwt={'yes' if got_jwt else 'NO'})")
    if buckets and completion_jwt == session_jwt:
        raise DeployError("no bucket upload returned a completion JWT — assets would not link")
    return completion_jwt


def ensure_custom_domain(account_id):
    existing = api("GET", f"/accounts/{account_id}/workers/domains") or []
    have = {d.get("hostname") for d in existing if isinstance(d, dict)}
    if CUSTOM_DOMAIN in have:
        ok(f"custom domain {CUSTOM_DOMAIN} already attached")
        return
    zones = api("GET", "/zones?name=bytenex.io") or []
    if not zones:
        raise DeployError("bytenex.io zone not found on this account")
    api("PUT", f"/accounts/{account_id}/workers/domains",
        {"hostname": CUSTOM_DOMAIN, "zone_id": zones[0]["id"], "service": SCRIPT_NAME})
    ok(f"custom domain {CUSTOM_DOMAIN} attached (DNS + cert provisioning)")


def main():
    waba_id = sys.argv[1] if len(sys.argv) > 1 else None

    step("Verifying account (must be the Bytenex account)")
    accounts = api("GET", "/accounts?per_page=50")
    account_id = accounts[0]["id"]
    if account_id != ACCOUNT_ID_EXPECTED:
        raise DeployError(f"unexpected account {account_id} ({accounts[0]['name']}) — refusing to deploy")
    ok(f"account: {accounts[0]['name']} ({account_id})")

    step("D1 database")
    db_id = ensure_d1(account_id)
    apply_schema(account_id, db_id)
    verify_token = seed_settings(account_id, db_id, waba_id)

    step("R2 bucket (best effort — token may lack R2 scope)")
    have_r2 = try_create_r2(account_id)

    step("Bundling + uploading worker")
    worker_src = bundle_worker()
    # Try richest binding set first; fall back if send_email is rejected.
    email_ok = True
    try:
        put_worker(account_id, worker_src, db_id, with_r2=have_r2, with_email=True)
    except DeployError as e:
        warn(f"deploy with send_email binding failed ({str(e)[:160]}...) — retrying without it")
        email_ok = False
        put_worker(account_id, worker_src, db_id, with_r2=have_r2, with_email=False)

    step("Uploading static assets")
    assets_jwt = upload_static_assets(account_id)
    put_worker(account_id, worker_src, db_id, with_assets_jwt=assets_jwt,
               with_r2=have_r2, with_email=email_ok)

    step("Custom domain")
    ensure_custom_domain(account_id)

    step("Cron schedule (broadcast queue + retries every minute)")
    try:
        api("PUT", f"/accounts/{account_id}/workers/scripts/{SCRIPT_NAME}/schedules",
            [{"cron": "* * * * *"}])
        ok("cron schedule set: * * * * *")
    except Exception as e:
        warn(f"could not set cron schedule ({str(e)[:140]}) — broadcast retries will not run until it is set")

    print(f"\nDEPLOYED: https://{CUSTOM_DOMAIN}")
    print(f"D1: {D1_NAME} ({db_id})  R2 bound: {have_r2}  send_email bound: {email_ok}")
    print(f"WEBHOOK_VERIFY_TOKEN={verify_token}")
    print(f"WEBHOOK_CALLBACK_URL=https://{CUSTOM_DOMAIN}/api/webhook")


if __name__ == "__main__":
    try:
        main()
    except DeployError as e:
        print(f"\nDEPLOY FAILED: {e}", file=sys.stderr)
        sys.exit(1)
