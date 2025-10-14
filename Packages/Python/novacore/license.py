import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import requests

def load_config(path: str = "config/config.json") -> Dict[str, Any]:
    if not os.path.exists(path):
        raise ValueError(f"Config file not found at {path}")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in {path}: {e}") from e
    if "license" not in data or not isinstance(data["license"], dict):
        raise ValueError('Config must contain object "license"')
    lic = data["license"]
    required = ["url"]
    missing = [k for k in required if not lic.get(k)]
    if missing:
        raise ValueError(f'Missing required fields in license: {", ".join(missing)}')
    if not isinstance(lic["url"], str) or not lic["url"].startswith(("http://", "https://")):
        raise ValueError("license.url must be a valid HTTP(S) URL")
    for k in ["key"]:
        if not isinstance(lic[k], str):
            raise ValueError(f"license.{k} must be a string")
    return data

def call_license_api(url: str, key: str, timeout: float = 15.0, use_body: bool = False) -> Dict[str, Any]:
    """
    Calls the license API.
    - If use_body=False: send only headers, no body.
    - If use_body=True: send JSON body {"license": key} in addition to headers.
    """
    headers = {
        "Accept": "application/json",
        "User-Agent": "LicenseCheck/1.0",
        "LICENSE_KEY": key,
    }

    try:
        if use_body:
            resp = requests.post(url, headers=headers, json={"license": key}, timeout=timeout)
        else:
            resp = requests.post(url, headers=headers, timeout=timeout)
    except requests.RequestException as e:
        raise RuntimeError(f"Network error calling license API: {e}") from e

    # Handle 404 specifically by inspecting JSON when available
    if resp.status_code == 404:
        invalid_key = False
        server_message = ""
        try:
            body = resp.json()
            server_message = body.get("message") or ""
            status = body.get("status")
            success = body.get("success")
            # Detect explicit invalid key phrasing
            if isinstance(server_message, str) and "license" in server_message.lower() and ("not found" in server_message.lower() or "invalid" in server_message.lower()):
                invalid_key = True
            # Error pattern also indicates invalid/unknown key
            if status == "error" and success is False and not invalid_key:
                if "key" in server_message.lower():
                    invalid_key = True
        except ValueError:
            server_message = (resp.text or "")[:300]

        if invalid_key:
            # Return a normalized error payload so login can print like other checks
            return {
                "error": {
                    "code": 404,
                    "reason": "Not Found",
                    "message": server_message or "License key not found",
                    "type": "INVALID_LICENSE_KEY",
                },
                # Minimal fields to allow compare_values-like printing
                "success": False,
                "status": "error",
            }
        else:
            preview = (server_message or (resp.text or ""))[:300]
            raise RuntimeError(f"HTTP 404 Not Found. Body: {preview}")

    if not resp.ok:
        preview = (resp.text or "")[:300]
        raise RuntimeError(f"HTTP {resp.status_code} {resp.reason}. Body: {preview}")

    if resp.status_code == 204 or not resp.content:
        raise RuntimeError("API returned no content")

    try:
        return resp.json()
    except ValueError:
        ct = resp.headers.get("Content-Type", "")
        preview = (resp.text or "")[:300]
        raise RuntimeError(f"Non-JSON response. Content-Type: {ct}. Body: {preview}")

def compare_values(cfg: Dict[str, Any], response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compares expected config values with the API response and returns a normalized result.
    Skips checks when the server returns null/None for discord_id, product.id, or product.name.
    Also skips a check if the expected value is missing/None in config.
    """
    lic_cfg = cfg["license"]
    expected_key = lic_cfg.get("key")
    expected_discord = lic_cfg.get("discord_id")
    expected_product_name = lic_cfg.get("product_name")
    expected_product_id = lic_cfg.get("product_id")

    normalized_error = response.get("error")
    if isinstance(normalized_error, dict) and normalized_error.get("type") == "INVALID_LICENSE_KEY":
        checks = {
            "api_success": False,
            "license_active": False,
            "key_matches": False,
            "discord_matches": False,
            "product_name_matches": False,
            "product_id_matches": False,
            "not_expired": False,
        }
        mismatches = ["Invalid License Key"]
        message = normalized_error.get("message")
        return {
            "ok": False,
            "checks": checks,
            "mismatches": mismatches,
            "message": message,
            "expires_at": None,
            "days_to_expiry": None,
            "remaining_ips": 0,
            "max_ips": 0,
            "used_ips_count": 0,
            "error_type": "INVALID_LICENSE_KEY",
            "error_http": f"{normalized_error.get('code')} {normalized_error.get('reason')}",
        }

    lic = response.get("license") or {}
    cust = response.get("customer") or {}
    prod = response.get("product") or {}

    now = datetime.now(timezone.utc)

    expires_at_str = lic.get("expires_at")
    expires_dt: Optional[datetime] = None
    if isinstance(expires_at_str, str):
        try:
            expires_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
        except Exception:
            expires_dt = None

    used_ips = lic.get("used_ips") or []
    max_ips = lic.get("max_ips") or 0
    used_ips_count = len(used_ips) if isinstance(used_ips, list) else 0
    remaining_ips = max(0, (max_ips if isinstance(max_ips, int) else 0) - used_ips_count)

    success_flag = response.get("success")
    status_text = response.get("status")
    api_success = (success_flag is True) or (success_flag is None and (status_text is None or status_text == "success"))

    # Server-provided fields
    server_license_key = lic.get("license_key")
    server_discord_id = cust.get("discord_id")
    server_product_name = prod.get("name")
    server_product_id = prod.get("id")

    # Determine skips (server or config missing)
    skip_discord_check = (server_discord_id is None) or (expected_discord is None)
    skip_product_id_check = (server_product_id is None) or (expected_product_id is None)
    skip_product_name_check = (server_product_name is None) or (expected_product_name is None)

    checks = {
        "api_success": api_success,
        "license_active": lic.get("status") == "active",
        "key_matches": server_license_key == expected_key,
        "discord_matches": True if skip_discord_check else (server_discord_id == expected_discord),
        "product_name_matches": True if skip_product_name_check else (server_product_name == expected_product_name),
        "product_id_matches": True if skip_product_id_check else (server_product_id == expected_product_id),
        "not_expired": (expires_dt is None) or (expires_dt > now),
    }

    mismatches = []
    if not checks["api_success"]:
        mismatches.append(f'API status indicates failure (status="{status_text}", success={success_flag})')
    if not checks["license_active"]:
        mismatches.append(f'License status is "{lic.get("status")}"')
    if not checks["key_matches"]:
        mismatches.append("license_key in response does not match config.key")
    if not skip_discord_check and not checks["discord_matches"]:
        mismatches.append("customer.discord_id does not match config.discord_id")
    if not skip_product_name_check and not checks["product_name_matches"]:
        mismatches.append("product.name does not match config.product_name")
    if not skip_product_id_check and not checks["product_id_matches"]:
        mismatches.append("product.id does not match config.product_id")
    if not checks["not_expired"]:
        mismatches.append("license is expired")

    return {
        "ok": len(mismatches) == 0,
        "checks": checks,
        "mismatches": mismatches,
        "message": response.get("message"),
        "expires_at": (expires_dt.isoformat() if expires_dt else None),
        "days_to_expiry": ((expires_dt - now).days if expires_dt else None),
        "remaining_ips": remaining_ips,
        "max_ips": max_ips if isinstance(max_ips, int) else 0,
        "used_ips_count": used_ips_count,
    }

def login(path: str = "config/config.json"):
    try:
        cfg = load_config(path)
    except Exception as e:
        print(f"[CONFIG ERROR] {e}")
        sys.exit(2)

    # First try with no body; if server 500s, try once with a JSON body
    try:
        resp = call_license_api(cfg["license"]["url"], cfg["license"]["key"], use_body=False)
    except RuntimeError as e:
        msg = str(e)
        if "HTTP 500" in msg or "Internal Server Error" in msg:
            try:
                resp = call_license_api(cfg["license"]["url"], cfg["license"]["key"], use_body=True)
            except Exception as e2:
                print(f"[API ERROR] {e2}")
                sys.exit(3)
        else:
            print(f"[API ERROR] {e}")
            sys.exit(3)

    result = compare_values(cfg, resp)

    print("License verification summary:")
    print(f" - Active: {result['checks']['license_active']}")
    print(f" - Not expired: {result['checks']['not_expired']}")
    print(f" - Expires at: {result['expires_at']}")
    print(f" - Days to expiry: {result['days_to_expiry']}")

    if not result["ok"]:
        print("[MISMATCHES]")
        for m in result["mismatches"]:
            print(f" - {m}")
        if result.get("error_type") == "INVALID_LICENSE_KEY":
            msg = result.get("message")
            if msg:
                print(f" - Server response: {msg}")
            sys.exit(5)
        sys.exit(4)

    print("All checks passed.")

def login_silent(path: str = "config/config.json"):
    try:
        cfg = load_config(path)
    except Exception as e:
        print(f"[CONFIG ERROR] {e}")
        sys.exit(2)

    # First try with no body; if server 500s, try once with a JSON body
    try:
        resp = call_license_api(cfg["license"]["url"], cfg["license"]["key"], use_body=False)
    except RuntimeError as e:
        msg = str(e)
        if "HTTP 500" in msg or "Internal Server Error" in msg:
            try:
                resp = call_license_api(cfg["license"]["url"], cfg["license"]["key"], use_body=True)
            except Exception as e2:
                print(f"[API ERROR] {e2}")
                sys.exit(3)
        else:
            print(f"[API ERROR] {e}")
            sys.exit(3)

    result = compare_values(cfg, resp)

    if not result["ok"]:
        print("[MISMATCHES]")
        for m in result["mismatches"]:
            print(f" - {m}")
        if result.get("error_type") == "INVALID_LICENSE_KEY":
            msg = result.get("message")
            if msg:
                print(f" - Server response: {msg}")
            sys.exit(5)
        sys.exit(4)

def login_noexit(path: str = "config/config.json"):
    try:
        cfg = load_config(path)
    except Exception as e:
        print(f"[CONFIG ERROR] {e}")

    # First try with no body; if server 500s, try once with a JSON body
    try:
        resp = call_license_api(cfg["license"]["url"], cfg["license"]["key"], use_body=False)
    except RuntimeError as e:
        msg = str(e)
        if "HTTP 500" in msg or "Internal Server Error" in msg:
            try:
                resp = call_license_api(cfg["license"]["url"], cfg["license"]["key"], use_body=True)
            except Exception as e2:
                print(f"[API ERROR] {e2}")
        else:
            print(f"[API ERROR] {e}")


    result = compare_values(cfg, resp)

    print("License verification summary:")
    print(f" - Active: {result['checks']['license_active']}")
    print(f" - Not expired: {result['checks']['not_expired']}")
    print(f" - Expires at: {result['expires_at']}")
    print(f" - Days to expiry: {result['days_to_expiry']}")

    if not result["ok"]:
        print("[MISMATCHES]")
        for m in result["mismatches"]:
            print(f" - {m}")
        if result.get("error_type") == "INVALID_LICENSE_KEY":
            msg = result.get("message")
            if msg:
                print(f" - Server response: {msg}")


    print("All checks passed.")