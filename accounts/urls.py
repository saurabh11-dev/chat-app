from django.urls import path
from .views import RegisterView, UserProfileView, UsernameAvailabilityView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('profile/', UserProfileView.as_view(), name='user-profile'),
    path('username-availability/', UsernameAvailabilityView.as_view(), name='username-availability'),
]