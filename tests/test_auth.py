import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request

from src.auth import (
    SESSION_DURATION_SECONDS,
    create_session_token,
    get_session_username,
    hash_password,
    require_teacher,
    verify_password,
)


class AuthenticationTests(unittest.TestCase):
    def test_password_hash_verifies_only_matching_password(self):
        stored_hash = hash_password("a sufficiently long password")

        self.assertTrue(verify_password("a sufficiently long password", stored_hash))
        self.assertFalse(verify_password("incorrect password", stored_hash))
        self.assertFalse(verify_password("password", "not-a-valid-hash"))

    def test_password_hash_rejects_short_passwords(self):
        with self.assertRaises(ValueError):
            hash_password("too short")

    def test_session_token_expires_and_rejects_tampering(self):
        issued_at = 1_700_000_000
        token = create_session_token("teacher1", "s" * 32, now=issued_at)

        self.assertEqual(
            get_session_username(token, "s" * 32, now=issued_at + 1), "teacher1"
        )
        self.assertIsNone(
            get_session_username(
                token, "s" * 32, now=issued_at + SESSION_DURATION_SECONDS
            )
        )
        self.assertIsNone(
            get_session_username(token + "tampered", "s" * 32, now=issued_at + 1)
        )

    def test_teacher_guard_requires_a_valid_session(self):
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/activities/Chess%20Club/signup",
            "query_string": b"",
            "headers": [],
        }
        request = Request(scope)

        with patch.dict(os.environ, {"SESSION_SECRET": "s" * 32}):
            with self.assertRaises(HTTPException) as error:
                require_teacher(request)
        self.assertEqual(error.exception.status_code, 401)

        token = create_session_token("teacher1", "s" * 32)
        scope["headers"] = [
            (b"cookie", f"teacher_session={token}".encode("ascii"))
        ]
        request = Request(scope)
        with patch.dict(os.environ, {"SESSION_SECRET": "s" * 32}):
            self.assertEqual(require_teacher(request), "teacher1")


if __name__ == "__main__":
    unittest.main()
