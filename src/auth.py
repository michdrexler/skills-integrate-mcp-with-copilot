import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from typing import Dict, Optional

from fastapi import HTTPException, Request

PASSWORD_HASH_ITERATIONS = 600_000
SESSION_COOKIE_NAME = "teacher_session"
SESSION_DURATION_SECONDS = 8 * 60 * 60


def hash_password(password: str) -> str:
    if len(password) < 12:
        raise ValueError("Teacher passwords must be at least 12 characters long.")

    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS
    )
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iteration_text, salt_hex, digest_hex = stored_hash.split("$")
        iterations = int(iteration_text)
        salt = bytes.fromhex(salt_hex)
        expected_digest = bytes.fromhex(digest_hex)
    except (AttributeError, ValueError):
        return False

    if (
        algorithm != "pbkdf2_sha256"
        or iterations < 100_000
        or iterations > 1_000_000
        or len(salt) != 16
        or len(expected_digest) != 32
    ):
        return False

    actual_digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(actual_digest, expected_digest)


def create_session_token(username: str, secret: str, now: Optional[int] = None) -> str:
    issued_at = int(time.time()) if now is None else now
    payload = json.dumps(
        {"username": username, "expires_at": issued_at + SESSION_DURATION_SECONDS},
        separators=(",", ":"),
    ).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")
    signature = hmac.new(
        secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256
    ).hexdigest()
    return f"{encoded_payload}.{signature}"


def get_session_username(
    token: Optional[str], secret: Optional[str], now: Optional[int] = None
) -> Optional[str]:
    if not token or not secret:
        return None

    try:
        encoded_payload, signature = token.rsplit(".", 1)
    except ValueError:
        return None

    try:
        expected_signature = hmac.new(
            secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256
        ).hexdigest()
    except UnicodeEncodeError:
        return None
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload_bytes = base64.urlsafe_b64decode(
            encoded_payload + "=" * (-len(encoded_payload) % 4)
        )
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None

    username = payload.get("username") if isinstance(payload, dict) else None
    expires_at = payload.get("expires_at") if isinstance(payload, dict) else None
    current_time = int(time.time()) if now is None else now
    if not isinstance(username, str) or not username:
        return None
    if not isinstance(expires_at, int) or expires_at <= current_time:
        return None
    return username


def load_teacher_credentials() -> Dict[str, str]:
    default_path = Path(__file__).with_name("teachers.json")
    credentials_path = Path(os.environ.get("TEACHERS_FILE", str(default_path)))
    try:
        with credentials_path.open(encoding="utf-8") as credentials_file:
            data = json.load(credentials_file)
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=503, detail="Teacher accounts are not configured."
        ) from error
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=503, detail="Teacher account configuration is invalid."
        ) from error

    teacher_records = data.get("teachers") if isinstance(data, dict) else None
    if not isinstance(teacher_records, list):
        raise HTTPException(
            status_code=503, detail="Teacher account configuration is invalid."
        )

    credentials: Dict[str, str] = {}
    for teacher in teacher_records:
        if (
            not isinstance(teacher, dict)
            or not isinstance(teacher.get("username"), str)
            or not teacher["username"]
            or not isinstance(teacher.get("password_hash"), str)
        ):
            raise HTTPException(
                status_code=503, detail="Teacher account configuration is invalid."
            )
        username = teacher["username"]
        if username in credentials:
            raise HTTPException(
                status_code=503, detail="Teacher account configuration is invalid."
            )
        credentials[username] = teacher["password_hash"]

    return credentials


def get_configured_session_secret() -> Optional[str]:
    secret = os.environ.get("SESSION_SECRET")
    if secret is None or len(secret.encode("utf-8")) < 32:
        return None
    return secret


def get_authenticated_teacher(request: Request) -> Optional[str]:
    return get_session_username(
        request.cookies.get(SESSION_COOKIE_NAME), get_configured_session_secret()
    )


def require_teacher(request: Request) -> str:
    username = get_authenticated_teacher(request)
    if username is None:
        raise HTTPException(status_code=401, detail="Teacher login required.")
    return username


def secure_cookie_enabled() -> bool:
    return os.environ.get("COOKIE_SECURE", "false").strip().lower() == "true"
