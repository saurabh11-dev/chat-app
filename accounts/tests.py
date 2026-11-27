from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.bloom import (
    BloomFilter,
    get_username_bloom_filter,
    validate_username_format,
    warm_up_bloom_filter,
)

User = get_user_model()


class BloomFilterUnitTests(TestCase):
  """Unit tests verifying BloomFilter algorithm, double hashing, and warmup."""

  def setUp(self):
    self.bf = BloomFilter(expected_elements=1000, false_positive_rate=0.01)

  def test_bloom_filter_no_false_negatives(self):
    """Every item added to the Bloom filter MUST test positive (might_contain == True)."""
    usernames = [f"User_{i}_{chr(65 + (i % 26))}" for i in range(150)]
    for u in usernames:
      self.bf.add(u)

    for u in usernames:
      self.assertTrue(
          self.bf.might_contain(u),
          f"False negative detected! Username '{u}' was added but might_contain returned False.",
      )

  def test_bloom_filter_case_insensitivity_and_whitespace(self):
    """Bloom filter normalization handles leading/trailing whitespace and case."""
    self.bf.add("SilentFalcon_42")

    self.assertTrue(self.bf.might_contain("silentfalcon_42"))
    self.assertTrue(self.bf.might_contain("SILENTFALCON_42"))
    self.assertTrue(self.bf.might_contain("  silentfalcon_42  "))
    self.assertTrue(self.bf.might_contain("@silentfalcon_42"))
    self.assertTrue(self.bf.might_contain("@SILENTFALCON_42"))

  def test_bloom_filter_unadded_item_returns_false(self):
    """Items not added should overwhelmingly test False for reasonable sizes."""
    self.bf.add("AlphaUser")
    self.bf.add("BetaUser")

    self.assertFalse(self.bf.might_contain("CompletelyUnrelatedNonExistentUser99"))

  def test_bloom_filter_clear(self):
    """Calling clear resets all bit positions and item count."""
    self.bf.add("Falcon")
    self.assertTrue(self.bf.might_contain("Falcon"))
    self.assertEqual(self.bf.count, 1)

    self.bf.clear()
    self.assertEqual(self.bf.count, 0)
    self.assertFalse(self.bf.might_contain("Falcon"))

  def test_bloom_filter_empty_and_none_safe(self):
    """Empty string and None do not cause exceptions and return False."""
    self.assertFalse(self.bf.might_contain(""))
    self.assertFalse(self.bf.might_contain("   "))
    self.assertFalse(self.bf.might_contain(None))

  def test_bloom_filter_warmup_from_database(self):
    """warm_up_bloom_filter populates existing handles from the database."""
    User.objects.create_user(
        email="u1@example.com",
        mobile_number="1111111111",
        password="pass",
        handle="WarmupUserOne",
    )
    User.objects.create_user(
        email="u2@example.com",
        mobile_number="2222222222",
        password="pass",
        handle="WarmupUserTwo",
    )

    fresh_bf = BloomFilter(expected_elements=1000)
    loaded_count = warm_up_bloom_filter(fresh_bf)

    self.assertGreaterEqual(loaded_count, 2)
    self.assertTrue(fresh_bf.might_contain("WarmupUserOne"))
    self.assertTrue(fresh_bf.might_contain("warmupuserone"))
    self.assertTrue(fresh_bf.might_contain("WarmupUserTwo"))
    self.assertFalse(fresh_bf.might_contain("NotExistingAtAll"))

  def test_validate_username_format(self):
    """Validates 3-30 character alphanumeric and underscore usernames."""
    # Valid usernames
    for valid in ["abc", "Silent_Falcon", "user_123", "a" * 30, "@My_Handle_1"]:
      is_valid, err, clean = validate_username_format(valid)
      self.assertTrue(is_valid, f"Expected '{valid}' to be valid, got: {err}")
      self.assertIsNone(err)
      self.assertFalse(clean.startswith("@"))

    # Invalid usernames
    invalid_cases = [
        (None, "Username is required."),
        ("", "Username cannot be empty or whitespace."),
        ("   ", "Username cannot be empty or whitespace."),
        ("ab", "Username must be between 3 and 30 characters."),
        ("a" * 31, "Username must be between 3 and 30 characters."),
        ("user-name", "Username can only contain letters, numbers, and underscores."),
        ("user name", "Username can only contain letters, numbers, and underscores."),
        ("user!name", "Username can only contain letters, numbers, and underscores."),
    ]
    for invalid, expected_err in invalid_cases:
      is_valid, err, _ = validate_username_format(invalid)
      self.assertFalse(is_valid, f"Expected '{invalid}' to be invalid")
      self.assertEqual(err, expected_err)


class UsernameAvailabilityEndpointTests(APITestCase):
  """Tests for GET /api/accounts/username-availability/."""

  def setUp(self):
    self.user = User.objects.create_user(
        email="alice@example.com",
        mobile_number="9876543210",
        password="password123",
        handle="Alice_Wonderland",
    )
    get_username_bloom_filter().add(self.user.handle)

  def test_available_username_returns_200_and_available_true(self):
    url = "/api/accounts/username-availability/?username=BrandNewHandle_99"
    response = self.client.get(url)
    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.assertTrue(response.data["available"])
    self.assertFalse(response.data.get("is_current", False))
    self.assertEqual(response.data["username"], "BrandNewHandle_99")

  def test_taken_username_returns_200_and_available_false(self):
    url = "/api/accounts/username-availability/?username=Alice_Wonderland"
    response = self.client.get(url)
    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.assertFalse(response.data["available"])
    self.assertFalse(response.data.get("is_current", False))
    self.assertIn("already taken", response.data["detail"].lower())

  def test_case_insensitive_taken_username(self):
    url = "/api/accounts/username-availability/?username=alice_wonderland"
    response = self.client.get(url)
    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.assertFalse(response.data["available"])

  def test_authenticated_user_own_current_username_returns_available_true_and_is_current(self):
    self.client.force_authenticate(user=self.user)
    url = "/api/accounts/username-availability/?username=Alice_Wonderland"
    response = self.client.get(url)
    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.assertTrue(response.data["available"])
    self.assertTrue(response.data["is_current"])

    # Also accepts with leading @
    url_at = "/api/accounts/username-availability/?username=@alice_wonderland"
    res_at = self.client.get(url_at)
    self.assertEqual(res_at.status_code, status.HTTP_200_OK)
    self.assertTrue(res_at.data["available"])
    self.assertTrue(res_at.data["is_current"])

  def test_missing_query_parameter_returns_400(self):
    response = self.client.get("/api/accounts/username-availability/")
    self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    self.assertFalse(response.data["available"])

  def test_invalid_username_format_returns_400(self):
    # Too short (< 3 chars)
    res_short = self.client.get("/api/accounts/username-availability/?username=ab")
    self.assertEqual(res_short.status_code, status.HTTP_400_BAD_REQUEST)
    self.assertFalse(res_short.data["available"])

    # Invalid special character
    res_chars = self.client.get(
        "/api/accounts/username-availability/?username=bad!user"
    )
    self.assertEqual(res_chars.status_code, status.HTTP_400_BAD_REQUEST)
    self.assertFalse(res_chars.data["available"])

    # Blank / whitespace only
    res_blank = self.client.get(
        "/api/accounts/username-availability/?username=   "
    )
    self.assertEqual(res_blank.status_code, status.HTTP_400_BAD_REQUEST)
    self.assertFalse(res_blank.data["available"])

  def test_preexisting_username_shows_unavailable_even_if_bloom_filter_is_cold_or_cleared(self):
    """
    Regression Test:
    Even if the in-memory Bloom filter was cold, cleared, or out of sync across worker processes,
    querying a pre-existing username MUST accurately report unavailable (available: False).
    It must also self-heal by registering the discovered username into the Bloom filter.
    """
    User.objects.create_user(
        email="coldtest@example.com",
        mobile_number="5554443322",
        password="password123",
        handle="ColdDbUser_99",
    )

    # Force the Bloom filter to be completely cold and cleared
    bf = get_username_bloom_filter()
    bf.clear()
    self.assertFalse(bf.might_contain("ColdDbUser_99"))

    # Live availability check endpoint call
    url = "/api/accounts/username-availability/?username=ColdDbUser_99"
    response = self.client.get(url)

    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.assertFalse(
        response.data["available"],
        "Expected pre-existing username to be unavailable even if Bloom filter was cold!",
    )
    self.assertFalse(response.data["is_available"])
    self.assertIn("already taken", response.data["detail"].lower())

    # Verify self-healing: Bloom filter should now contain ColdDbUser_99
    self.assertTrue(bf.might_contain("ColdDbUser_99"))
    self.assertTrue(bf.might_contain("colddbuser_99"))

  def test_unused_username_shows_available_when_bloom_filter_is_cold(self):
    """Unused valid username returns available: True cleanly even when Bloom filter is cold."""
    bf = get_username_bloom_filter()
    bf.clear()

    url = "/api/accounts/username-availability/?username=FreshUnusedHandle_77"
    response = self.client.get(url)

    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.assertTrue(response.data["available"])
    self.assertTrue(response.data["is_available"])
    self.assertFalse(response.data.get("is_current", False))

  def test_existing_user_silent_cipher_50_unavailable_and_profile_update_rejected(self):
    """
    Direct regression test for the reported issue:
    User A has handle SilentCipher_50 in the database.
    User B has handle SilentCipher_51.
    Bloom filter is NOT manually pre-seeded in this test.
    Verify:
    1. Availability check for SilentCipher_50 reports available: false.
    2. User B attempting to update profile to SilentCipher_50 is rejected cleanly with 400.
    """
    user_a = User.objects.create_user(
        email="user_a@example.com",
        mobile_number="7771112233",
        password="password123",
        handle="SilentCipher_50",
    )
    user_b = User.objects.create_user(
        email="user_b@example.com",
        mobile_number="7771112244",
        password="password123",
        handle="SilentCipher_51",
    )

    # Clear bloom filter so it is NOT manually pre-seeded
    get_username_bloom_filter().clear()

    # User B checks availability while editing
    self.client.force_authenticate(user=user_b)
    res_avail = self.client.get("/api/accounts/username-availability/?username=SilentCipher_50")
    self.assertEqual(res_avail.status_code, status.HTTP_200_OK)
    self.assertFalse(res_avail.data["available"])
    self.assertFalse(res_avail.data["is_available"])
    self.assertIn("already taken", res_avail.data["detail"].lower())

    # User B attempts to save changes with SilentCipher_50
    res_patch = self.client.patch("/api/accounts/profile/", {"username": "SilentCipher_50"})
    self.assertEqual(res_patch.status_code, status.HTTP_400_BAD_REQUEST)
    self.assertIn("already taken", res_patch.data["detail"].lower())

    # User B's handle remains unchanged
    user_b.refresh_from_db()
    self.assertEqual(user_b.handle, "SilentCipher_51")




class UserProfileUpdateEndpointTests(APITestCase):
  """Tests for PATCH /api/accounts/profile/."""

  def setUp(self):
    self.user1 = User.objects.create_user(
        email="bob@example.com",
        mobile_number="1234567890",
        password="password123",
        handle="BobTheBuilder",
    )
    self.user2 = User.objects.create_user(
        email="carol@example.com",
        mobile_number="2345678901",
        password="password123",
        handle="CarolDanvers",
    )
    get_username_bloom_filter().add(self.user1.handle)
    get_username_bloom_filter().add(self.user2.handle)

  def test_unauthenticated_profile_update_returns_401(self):
    url = "/api/accounts/profile/"
    response = self.client.patch(url, {"username": "BobUpdated"})
    self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

  def test_authenticated_profile_update_success(self):
    self.client.force_authenticate(user=self.user1)
    url = "/api/accounts/profile/"
    response = self.client.patch(
        url,
        {
            "username": "Bob_The_Architect",
            "name": "Robert Builder",
        },
    )
    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.assertEqual(response.data["handle"], "Bob_The_Architect")
    self.assertEqual(response.data["username"], "Bob_The_Architect")
    self.assertEqual(response.data["first_name"], "Robert")
    self.assertEqual(response.data["last_name"], "Builder")
    self.assertEqual(response.data["name"], "Robert Builder")

    # Verify DB state
    self.user1.refresh_from_db()
    self.assertEqual(self.user1.handle, "Bob_The_Architect")
    self.assertEqual(self.user1.first_name, "Robert")
    self.assertEqual(self.user1.last_name, "Builder")

    # Verify Bloom filter was updated with the new username
    self.assertTrue(
        get_username_bloom_filter().might_contain("Bob_The_Architect")
    )

  def test_duplicate_username_rejected_with_400(self):
    self.client.force_authenticate(user=self.user1)
    url = "/api/accounts/profile/"

    # Attempt to take Carol's handle (case-insensitive)
    response = self.client.patch(url, {"username": "caroldanvers"})
    self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
    self.assertIn("already taken", response.data["detail"].lower())

    # User's handle in DB should remain unchanged
    self.user1.refresh_from_db()
    self.assertEqual(self.user1.handle, "BobTheBuilder")

  def test_updating_with_own_current_handle_succeeds(self):
    self.client.force_authenticate(user=self.user1)
    url = "/api/accounts/profile/"
    response = self.client.patch(
        url,
        {
            "username": "BobTheBuilder",
            "name": "Bob B",
        },
    )
    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.assertEqual(response.data["handle"], "BobTheBuilder")
    self.assertEqual(response.data["name"], "Bob B")

  def test_invalid_username_format_rejected_with_400(self):
    self.client.force_authenticate(user=self.user1)
    url = "/api/accounts/profile/"

    # Too short
    res_short = self.client.patch(url, {"username": "ab"})
    self.assertEqual(res_short.status_code, status.HTTP_400_BAD_REQUEST)

    # Invalid chars
    res_char = self.client.patch(url, {"username": "bad-username!"})
    self.assertEqual(res_char.status_code, status.HTTP_400_BAD_REQUEST)

    self.user1.refresh_from_db()
    self.assertEqual(self.user1.handle, "BobTheBuilder")

  def test_read_only_fields_email_and_mobile_cannot_be_altered(self):
    self.client.force_authenticate(user=self.user1)
    url = "/api/accounts/profile/"
    response = self.client.patch(
        url,
        {
            "email": "hacker@example.com",
            "mobile_number": "0000000000",
            "username": "BobLegit",
        },
    )
    self.assertEqual(response.status_code, status.HTTP_200_OK)

    self.user1.refresh_from_db()
    self.assertEqual(self.user1.email, "bob@example.com")
    self.assertEqual(self.user1.mobile_number, "1234567890")
    self.assertEqual(self.user1.handle, "BobLegit")


class EmailAuthRegistrationAndLoginTests(APITestCase):
  """Ensures existing email-based registration and login flows remain completely intact."""

  def test_register_creates_user_with_generated_handle_and_bloom_addition(self):
    url = "/api/accounts/register/"
    payload = {
        "email": "newuser@example.com",
        "mobile_number": "9998887776",
        "password": "SecurePassword123!",
    }
    response = self.client.post(url, payload)
    self.assertEqual(response.status_code, status.HTTP_201_CREATED)
    self.assertEqual(response.data["email"], "newuser@example.com")
    self.assertIn("handle", response.data)

    generated_handle = response.data["handle"]
    self.assertTrue(bool(generated_handle))

    # Verify newly registered user is in the Bloom filter
    self.assertTrue(
        get_username_bloom_filter().might_contain(generated_handle)
    )

  def test_email_login_obtains_jwt_tokens(self):
    User.objects.create_user(
        email="loginuser@example.com",
        mobile_number="8887776665",
        password="MyPassword123",
    )

    url = "/api/token/"
    payload = {
        "email": "loginuser@example.com",
        "password": "MyPassword123",
    }
    response = self.client.post(url, payload)
    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.assertIn("access", response.data)
    self.assertIn("refresh", response.data)

  def test_email_login_wrong_password_rejected(self):
    User.objects.create_user(
        email="wrongpass@example.com",
        mobile_number="7776665554",
        password="MyPassword123",
    )

    url = "/api/token/"
    payload = {
        "email": "wrongpass@example.com",
        "password": "IncorrectPassword",
    }
    response = self.client.post(url, payload)
    self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
