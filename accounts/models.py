import random
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class CustomUserManager(BaseUserManager):
  """Custom manager where email is the unique identifier for authentication."""

  def create_user(self, email, mobile_number, password=None, **extra_fields):
    if not email:
      raise ValueError("The Email field must be set")
    email = self.normalize_email(email)
    user = self.model(
        email=email, mobile_number=mobile_number, **extra_fields
    )
    user.set_password(password)
    user.save(using=self._db)
    return user

  def create_superuser(self, email, mobile_number, password=None, **extra_fields):
    extra_fields.setdefault("is_staff", True)
    extra_fields.setdefault("is_superuser", True)
    extra_fields.setdefault("is_active", True)

    if extra_fields.get("is_staff") is not True:
      raise ValueError("Superuser must have is_staff=True.")
    if extra_fields.get("is_superuser") is not True:
      raise ValueError("Superuser must have is_superuser=True.")

    return self.create_user(email, mobile_number, password, **extra_fields)


def generate_random_username():
  """Generates a random anonymous handle like 'SilentFalcon_42'."""
  adjectives = [
      "Silent",
      "Cosmic",
      "Shadow",
      "Neon",
      "Swift",
      "Hidden",
      "Ghost",
      "Alpha",
  ]
  nouns = ["Falcon", "Vortex", "Nomad", "Cipher", "Pulse", "Drifter", "Echo"]
  number = random.randint(10, 99)
  return f"{random.choice(adjectives)}{random.choice(nouns)}_{number}"


class User(AbstractUser):
  
  username = None

  email = models.EmailField(unique=True)
  mobile_number = models.CharField(max_length=15, unique=True)

 
  handle = models.CharField(
      max_length=50, unique=True, default=generate_random_username
  )

  objects = CustomUserManager()

  USERNAME_FIELD = "email"
  REQUIRED_FIELDS = ["mobile_number"]

  def save(self, *args, **kwargs):
   
    if not self.handle:
      while True:
        candidate = generate_random_username()
        if not self.__class__.objects.filter(handle=candidate).exists():
          self.handle = candidate
          break
    super().save(*args, **kwargs)

  def __str__(self):
    return f"{self.email} -> [{self.handle}]"