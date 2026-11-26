import math

from rest_framework import serializers

from .models import ChatRoom, Message, RoomMembership
from .moderation import has_abusive_content


class ChatRoomSerializer(serializers.ModelSerializer):
    created_by_handle = serializers.CharField(
        source='created_by.handle', read_only=True
    )
    distance_km = serializers.FloatField(read_only=True, required=False)
    is_member = serializers.SerializerMethodField()
    radius = serializers.DecimalField(
        source='radius_km',
        max_digits=5,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = ChatRoom
        fields = [
            'id',
            'name',
            'description',
            'created_by_handle',
            'latitude',
            'longitude',
            'radius_km',
            'radius',
            'is_active',
            'distance_km',
            'is_member',
            'created_at',
        ]
        read_only_fields = ['id', 'created_by_handle', 'is_active', 'created_at']

    def to_internal_value(self, data):
        if isinstance(data, dict) and 'radius' in data and 'radius_km' not in data:
            mutable = data.copy()
            mutable['radius_km'] = mutable.get('radius')
            data = mutable
        return super().to_internal_value(data)

    def get_is_member(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return False
        return RoomMembership.objects.filter(
            room=obj, user=request.user, is_active=True
        ).exists()

    def validate_name(self, value):
        cleaned = (value or "").strip()
        if not cleaned:
            raise serializers.ValidationError("Room name cannot be empty.")
        return cleaned

    def validate_latitude(self, value):
        val = float(value)
        if not math.isfinite(val) or not (-90 <= val <= 90):
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_longitude(self, value):
        val = float(value)
        if not math.isfinite(val) or not (-180 <= val <= 180):
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value

    def validate_radius_km(self, value):
        val = float(value)
        if not math.isfinite(val) or val <= 0 or val > 500:
            raise serializers.ValidationError("Radius must be greater than 0 and at most 500 km.")
        return value



class RoomMembershipSerializer(serializers.ModelSerializer):
    handle = serializers.CharField(source='user.handle', read_only=True)
    room_name = serializers.CharField(source='room.name', read_only=True)

    class Meta:
        model = RoomMembership
        fields = [
            'id',
            'room',
            'room_name',
            'handle',
            'is_active',
            'joined_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'room',
            'room_name',
            'handle',
            'joined_at',
            'updated_at',
        ]


class MessageSerializer(serializers.ModelSerializer):
    sender_handle = serializers.CharField(
        source='sender.handle', read_only=True
    )

    class Meta:
        model = Message
        fields = [
            'id',
            'room',
            'sender_handle',
            'content',
            'created_at',
        ]
        read_only_fields = ['id', 'room', 'sender_handle', 'created_at']

    def validate_content(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Message content cannot be empty.")
        if has_abusive_content(cleaned):
            raise serializers.ValidationError(
                "Message contains abusive or inappropriate language and cannot be sent."
            )
        return cleaned