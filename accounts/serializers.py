from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
  
  password = serializers.CharField(write_only=True)

  class Meta:
    model = User
    fields = ['email', 'mobile_number', 'password', 'handle']
    
    read_only_fields = ['handle']

  def create(self, validated_data):
   
    return User.objects.create_user(**validated_data)


class UserProfileSerializer(serializers.ModelSerializer):
  class Meta:
    model = User
    fields = ['id', 'email', 'mobile_number', 'handle']

    read_only_fields = ['id', 'email', 'mobile_number']