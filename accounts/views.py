from django.shortcuts import render
from django.contrib.auth import get_user_model
from rest_framework import generics, permissions
from .serializers import RegisterSerializer
from rest_framework.permissions import IsAuthenticated
from .serializers import UserProfileSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
  queryset = User.objects.all()
  serializer_class = RegisterSerializer
  
  permission_classes = [permissions.AllowAny]
  
class UserProfileView(generics.RetrieveUpdateAPIView):
  queryset = User.objects.all()
  serializer_class = UserProfileSerializer
  permission_classes = [IsAuthenticated] 

  def get_object(self):
   
    return self.request.user
