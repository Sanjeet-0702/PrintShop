"""
Security helpers.

- pickup codes for customers
- password hashing for shop owners (scrypt, standard library only)
- signed login tokens for the shop dashboard
- a small limiter that stops password / pickup-code guessing
"""

import base64
import hashlib
import hmac
import json
import secrets
import threading
import time

# no 0/O or 1/I, so the code is easy to read out
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_pickup_code(length: int = 6) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def codes_match(
    stored_code: str | None,
    given_code: str | None,
) -> bool:
    """
    Compare pickup codes safely (case-insensitive).
    """

    if not stored_code or not given_code:
        return False

    return hmac.compare_digest(
        stored_code.strip().upper().encode("utf-8"),
        given_code.strip().upper().encode("utf-8"),
    )


# =========================================================
# PASSWORDS
# =========================================================

_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1


def hash_password(password: str) -> str:
    """
    Turn a password into a salted hash that is safe to store.
    Format: scrypt$N$r$p$salt$hash
    """

    salt = secrets.token_bytes(16)

    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        maxmem=64 * 1024 * 1024,
        dklen=32,
    )

    return (
        f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}"
        f"${salt.hex()}${digest.hex()}"
    )


def verify_password(password: str, stored_hash: str | None) -> bool:
    """
    Check a password against a stored hash.
    Never raises; a bad or missing hash simply returns False.
    """

    try:

        if not stored_hash:
            return False

        scheme, n, r, p, salt_hex, hash_hex = stored_hash.split("$")

        if scheme != "scrypt":
            return False

        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            maxmem=64 * 1024 * 1024,
            dklen=len(bytes.fromhex(hash_hex)),
        )

        return hmac.compare_digest(digest, bytes.fromhex(hash_hex))

    except Exception:
        return False


# A real-looking hash, checked when the shop does not exist, so a
# wrong shop name and a wrong password take the same time to answer.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


# =========================================================
# LOGIN TOKENS
# =========================================================

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_token(secret: str, shop_id: int, lifetime_seconds: int) -> str:
    """
    A signed token that proves "this browser logged in as shop <id>".
    """

    payload = json.dumps(
        {
            "shop_id": shop_id,
            "exp": int(time.time()) + lifetime_seconds,
        },
        separators=(",", ":"),
    ).encode("utf-8")

    signature = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).digest()

    return f"{_b64(payload)}.{_b64(signature)}"


def read_token(secret: str, token: str | None) -> int | None:
    """
    Returns the shop id if the token is genuine and not expired,
    otherwise None.
    """

    try:

        if not token:
            return None

        payload_part, signature_part = token.split(".")

        payload = _unb64(payload_part)

        expected = hmac.new(
            secret.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).digest()

        if not hmac.compare_digest(expected, _unb64(signature_part)):
            return None

        data = json.loads(payload)

        if int(data["exp"]) < time.time():
            return None

        return int(data["shop_id"])

    except Exception:
        return None


# =========================================================
# GUESS LIMITER
# =========================================================

class AttemptLimiter:
    """
    Allows only a few wrong tries in a time window per key
    (for example per shop and IP address, or per order).
    Kept in memory, so it resets when the server restarts.
    """

    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str) -> list[float]:
        cutoff = time.time() - self.window_seconds

        recent = [
            stamp
            for stamp in self._failures.get(key, [])
            if stamp > cutoff
        ]

        if recent:
            self._failures[key] = recent
        else:
            self._failures.pop(key, None)

        return recent

    def is_blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key)) >= self.max_failures

    def record_failure(self, key: str) -> None:
        with self._lock:
            self._recent(key)
            self._failures.setdefault(key, []).append(time.time())

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)