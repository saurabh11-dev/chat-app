from rest_framework import serializers

from .models import ChatRoom, Message, RoomMembership
from .moderation import has_abusive_content


class ChatRoomSerializer(serializers.ModelSerializer):
    created_by_handle = serializers.CharField(
        source='created_by.handle', read_only=True
    )
    distance_km = serializers.FloatField(read_only=True, required=False)

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
            'is_active',
            'distance_km',
            'created_at',
        ]
        read_only_fields = ['id', 'created_by_handle', 'is_active', 'created_at']

    def validate_latitude(self, value):
        if not (-90 <= float(value) <= 90):
            raise serializers.ValidationError("Latitude must be between -90 and 90.")
        return value

    def validate_longitude(self, value):
        if not (-180 <= float(value) <= 180):
            raise serializers.ValidationError("Longitude must be between -180 and 180.")
        return value

    def validate_radius_km(self, value):
        if float(value) <= 0:
            raise serializers.ValidationError("Radius must be greater than 0 km.")
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