from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .bloom import (
    check_username_availability,
    get_username_bloom_filter,
    validate_username_format,
)
from .serializers import RegisterSerializer, UserProfileSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
  queryset = User.objects.all()
  serializer_class = RegisterSerializer
  permission_classes = [permissions.AllowAny]


class UsernameAvailabilityView(APIView):
  """
  Checks username availability using Bloom filter with DB confirmation.
  Query parameters: ?username=<handle> (or ?handle=<handle>)
  """

  permission_classes = [permissions.AllowAny]

  def get(self, request, *args, **kwargs):
    username = request.query_params.get("username") or request.query_params.get("handle")
    if username is None:
      return Response(
          {
              "available": False,
              "detail": "The 'username' query parameter is required.",
              "error": "The 'username' query parameter is required.",
          },
          status=status.HTTP_400_BAD_REQUEST,
      )

    is_valid, error_msg, clean = validate_username_format(username)
    if not is_valid:
      return Response(
          {
              "available": False,
              "is_current": False,
              "username": clean,
              "detail": error_msg,
              "error": error_msg,
          },
          status=status.HTTP_400_BAD_REQUEST,
      )

    result = check_username_availability(clean, current_user=request.user)
    return Response(result, status=status.HTTP_200_OK)


class UserProfileView(generics.RetrieveUpdateAPIView):
  """
  Retrieves and updates authenticated user profile (username/handle, first_name, last_name, name).
  Enforces atomic transaction and username uniqueness check with Bloom filter synchronization.
  """

  queryset = User.objects.all()
  serializer_class = UserProfileSerializer
  permission_classes = [IsAuthenticated]

  def get_object(self):
    return self.request.user

  def update(self, request, *args, **kwargs):
    partial = kwargs.pop("partial", True)
    user = self.get_object()

    data = (
        request.data.copy()
        if hasattr(request.data, "copy")
        else dict(request.data)
    )

    # Handle display / account name alias ('name' or 'account_name')
    raw_name = data.get("name") if "name" in data else data.get("account_name")
    if raw_name is not None and isinstance(raw_name, str):
      parts = raw_name.strip().split(" ", 1)
      data["first_name"] = parts[0]
      data["last_name"] = parts[1] if len(parts) > 1 else ""

    # Handle username / handle update
    new_username = data.get("username") if "username" in data else data.get("handle")
    cleaned_username = None

    if new_username is not None:
      is_valid, error_msg, cleaned_username = validate_username_format(
          new_username
      )
      if not is_valid:
        return Response(
            {
                "detail": error_msg,
                "username": [error_msg],
                "error": error_msg,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
      data["handle"] = cleaned_username

    with transaction.atomic():
      if cleaned_username is not None:
        # Re-verify uniqueness in DB excluding the current user
        if (
            User.objects.filter(handle__iexact=cleaned_username)
            .exclude(pk=user.pk)
            .exists()
        ):
          return Response(
              {
                  "detail": "Username is already taken.",
                  "username": ["A user with that username already exists."],
                  "error": "Username is already taken.",
              },
              status=status.HTTP_400_BAD_REQUEST,
          )

      serializer = self.get_serializer(user, data=data, partial=partial)
      serializer.is_valid(raise_exception=True)
      self.perform_update(serializer)

      if cleaned_username is not None:
        get_username_bloom_filter().add(cleaned_username)

    return Response(serializer.data, status=status.HTTP_200_OK)
