import hashlib
import logging
import math
import re
import struct
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Valid username format: 3-30 characters, alphanumeric and underscores
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_]{3,30}$")


class BloomFilter:
    """
    Space-efficient probabilistic data structure for case-insensitive username presence checks.
    Uses optimal bit-array sizing (m) and Kirsch-Mitzenmacher double-hashing (k positions).

    Mathematical properties:
    - Optimal bit-array size: m = - (n * ln(p)) / (ln(2)^2)
    - Optimal hash count:     k = (m / n) * ln(2)
    - Double hashing:         g_i(x) = (h1(x) + i * h2(x)) % m
    - Zero false negatives:   If an item was added, might_contain() is GUARANTEED to return True.
    """

    def __init__(
        self,
        expected_elements: int = 100_000,
        false_positive_rate: float = 0.01,
        size: Optional[int] = None,
        hash_count: Optional[int] = None,
    ):
        if size is not None and hash_count is not None:
            self.m = max(1, int(size))
            self.k = max(1, int(hash_count))
        else:
            n = max(1, int(expected_elements))
            p = max(1e-9, min(0.5, float(false_positive_rate)))
            self.m = max(1, int(math.ceil(-(n * math.log(p)) / (math.log(2) ** 2))))
            self.k = max(1, int(round((self.m / n) * math.log(2))))

        self.byte_count = (self.m + 7) // 8
        self.bit_array = bytearray(self.byte_count)
        self.count = 0

    @staticmethod
    def normalize(item: str) -> str:
        """Case-insensitive normalized input: strip whitespace and lowercase."""
        if not item:
            return ""
        clean = str(item).strip()
        if clean.startswith("@"):
            clean = clean[1:].strip()
        return clean.lower()

    def _hash_pair(self, normalized_item: str) -> Tuple[int, int]:
        """Computes two 64-bit independent hashes using SHA-256 for double-hashing."""
        digest = hashlib.sha256(normalized_item.encode("utf-8")).digest()
        h1, h2 = struct.unpack_from("<QQ", digest)
        if h2 == 0:
            h2 = 1
        return h1, h2

    def add(self, item: str) -> None:
        """Adds a normalized username to the Bloom filter."""
        norm = self.normalize(item)
        if not norm:
            return
        h1, h2 = self._hash_pair(norm)
        for i in range(self.k):
            idx = (h1 + i * h2) % self.m
            self.bit_array[idx // 8] |= 1 << (idx % 8)
        self.count += 1

    def might_contain(self, item: str) -> bool:
        """
        Tests if item might be present in the Bloom filter.
        Returns False if definitely NOT present (guaranteed NO FALSE NEGATIVES).
        Returns True if item might be present (potential false positive).
        """
        norm = self.normalize(item)
        if not norm:
            return False
        h1, h2 = self._hash_pair(norm)
        for i in range(self.k):
            idx = (h1 + i * h2) % self.m
            if not (self.bit_array[idx // 8] & (1 << (idx % 8))):
                return False
        return True

    def __contains__(self, item: str) -> bool:
        return self.might_contain(item)

    def clear(self) -> None:
        """Resets the bit array and added count."""
        self.bit_array = bytearray(self.byte_count)
        self.count = 0


# Global singleton instance for the process
_bloom_filter_instance: Optional[BloomFilter] = None


def get_username_bloom_filter() -> BloomFilter:
    """Returns the singleton username Bloom filter instance."""
    global _bloom_filter_instance
    if _bloom_filter_instance is None:
        _bloom_filter_instance = BloomFilter()
    return _bloom_filter_instance


def warm_up_bloom_filter(bf: Optional[BloomFilter] = None) -> int:
    """
    Safely loads all existing usernames/handles from DB into the Bloom filter.
    Guards against missing tables during migrations/tests so it never crashes.
    """
    import warnings

    filter_obj = bf if bf is not None else get_username_bloom_filter()

    try:
        from django.contrib.auth import get_user_model
        from django.db import connection

        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=RuntimeWarning)
            User = get_user_model()
            table_name = User._meta.db_table

            existing_tables = connection.introspection.table_names()
            if table_name not in existing_tables:
                logger.info("Table %s not yet created. Skipping Bloom filter warmup.", table_name)
                return 0

            handles = User.objects.values_list("handle", flat=True)
            count = 0
            for handle in handles.iterator(chunk_size=2000):
                if handle:
                    filter_obj.add(handle)
                    count += 1

            logger.info("Warmed up username Bloom filter with %d existing usernames.", count)
            return count
    except Exception as e:
        logger.warning("Could not warm up username Bloom filter: %s", e)
        return 0



def validate_username_format(username: str) -> Tuple[bool, Optional[str], str]:
    """
    Validates username format (3-30 chars, alphanumeric + underscores, cannot be empty/whitespace).
    Returns (is_valid, error_message, cleaned_username).
    """
    if username is None:
        return False, "Username is required.", ""

    clean = str(username).strip()
    if clean.startswith("@"):
        clean = clean[1:].strip()

    if not clean:
        return False, "Username cannot be empty or whitespace.", ""

    if len(clean) < 3 or len(clean) > 30:
        return False, "Username must be between 3 and 30 characters.", clean

    if not USERNAME_REGEX.match(clean):
        return (
            False,
            "Username can only contain letters, numbers, and underscores.",
            clean,
        )

    return True, None, clean


def check_username_availability(username: str, current_user=None) -> dict:
    """
    Checks if a username is available.
    - If user is authenticated and matches own current username:
        available: True, is_current: True
    - Checks Bloom filter first:
        if might_contain == False:
            available: True, is_current: False (source='bloom_filter')
    - If might_contain == True:
        confirm against DB:
            exists in DB (excluding current_user if any):
                available: False, is_current: False (source='database')
            else (false positive):
                available: True, is_current: False (source='database_fallback')
    """
    is_valid, error_msg, clean = validate_username_format(username)
    if not is_valid:
        return {
            "available": False,
            "is_current": False,
            "username": clean,
            "detail": error_msg,
            "error": error_msg,
        }

    from django.contrib.auth import get_user_model

    User = get_user_model()

    # Check if this is the user's own current username
    if current_user and getattr(current_user, "is_authenticated", False):
        current_handle = getattr(current_user, "handle", None) or getattr(current_user, "username", None)
        if current_handle and str(current_handle).strip().lower() == clean.lower():
            return {
                "available": True,
                "is_current": True,
                "username": clean,
                "detail": "This is your current username.",
            }

    bf = get_username_bloom_filter()

    # 1. Bloom filter check: if False, DEFINITELY NOT taken (no DB query needed)
    if not bf.might_contain(clean):
        return {
            "available": True,
            "is_current": False,
            "username": clean,
            "detail": "Username is available.",
            "source": "bloom_filter",
        }

    # 2. Bloom filter might_contain() is True -> verify with database (final source of truth)
    qs = User.objects.filter(handle__iexact=clean)
    if current_user and getattr(current_user, "is_authenticated", False):
        qs = qs.exclude(pk=current_user.pk)

    if qs.exists():
        return {
            "available": False,
            "is_current": False,
            "username": clean,
            "detail": "Username is already taken.",
            "source": "database",
        }

    # False positive in Bloom filter, but actually available in DB
    return {
        "available": True,
        "is_current": False,
        "username": clean,
        "detail": "Username is available.",
        "source": "database_fallback",
    }
