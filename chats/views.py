import math

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status, views
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .pagination import MessagePagination

from .models import ChatRoom, Message, RoomMembership
from .serializers import (
    ChatRoomSerializer,
    MessageSerializer,
    RoomMembershipSerializer,
)
from .utils import haversine_km


def _extract_raw_coordinates(primary, fallback=None):
    """Extract raw lat/lng values supporting both short ('lat'/'lng') and full ('latitude'/'longitude') keys."""
    def _pick(short_key, long_key):
        for source in (primary, fallback):
            if source is None:
                continue
            if short_key in source:
                return source.get(short_key)
            if long_key in source:
                return source.get(long_key)
        return None

    return _pick('lat', 'latitude'), _pick('lng', 'longitude')


def _parse_coordinates(lat_raw, lng_raw):
    """Validate and parse coordinate strings/numbers into finite (lat, lng) floats."""
    if (lat_raw is None) != (lng_raw is None):
        raise ValidationError(
            {"detail": "Both 'lat' ('latitude') and 'lng' ('longitude') are required together."}
        )
    if lat_raw is None and lng_raw is None:
        return None

    try:
        user_lat = float(lat_raw)
        user_lng = float(lng_raw)
    except (TypeError, ValueError):
        raise ValidationError(
            {"detail": "'lat' and 'lng' must be valid numbers."}
        )

    if not math.isfinite(user_lat) or not math.isfinite(user_lng):
        raise ValidationError(
            {"detail": "Coordinates must be finite numbers."}
        )

    if not (-90 <= user_lat <= 90) or not (-180 <= user_lng <= 180):
        raise ValidationError(
            {"detail": "Coordinates out of range (lat: -90..90, lng: -180..180)."}
        )

    return user_lat, user_lng


class ChatRoomListCreateView(generics.ListCreateAPIView):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = ChatRoom.objects.filter(is_active=True).select_related('created_by')

        if self.request.method == 'GET':
            joined_param = str(self.request.query_params.get('joined', '')).lower()
            if joined_param in ('true', '1', 'yes'):
                queryset = queryset.filter(
                    memberships__user=self.request.user,
                    memberships__is_active=True,
                ).distinct()

            lat_raw, lng_raw = _extract_raw_coordinates(self.request.query_params)
            coords = _parse_coordinates(lat_raw, lng_raw)

            if coords is not None:
                user_lat, user_lng = coords
                radius_param = self.request.query_params.get('radius', '30')
                try:
                    search_radius = float(radius_param)
                except (TypeError, ValueError):
                    raise ValidationError(
                        {"detail": "'radius' must be a valid number."}
                    )

                if not math.isfinite(search_radius) or search_radius <= 0:
                    raise ValidationError(
                        {"detail": "'radius' must be greater than 0."}
                    )

                nearby_rooms = []
                for room in queryset:
                    dist = haversine_km(
                        user_lat, user_lng, room.latitude, room.longitude
                    )
                    effective_limit = float(room.radius_km)
                    if dist <= effective_limit and dist <= search_radius:
                        room.distance_km = dist
                        nearby_rooms.append(room)

                nearby_rooms.sort(key=lambda r: r.distance_km)
                return nearby_rooms

        return queryset

    def perform_create(self, serializer):
        with transaction.atomic():
            room = serializer.save(created_by=self.request.user)
            RoomMembership.objects.create(
                room=room,
                user=self.request.user,
                is_active=True,
            )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )


class JoinedRoomListView(generics.ListAPIView):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            ChatRoom.objects.filter(
                is_active=True,
                memberships__user=self.request.user,
                memberships__is_active=True,
            )
            .select_related('created_by')
            .order_by('-memberships__joined_at')
            .distinct()
        )


class ChatRoomDetailView(generics.RetrieveAPIView):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        room = get_object_or_404(
            ChatRoom.objects.select_related('created_by'),
            pk=self.kwargs['pk'],
            is_active=True,
        )
        lat_raw, lng_raw = _extract_raw_coordinates(self.request.query_params)
        coords = _parse_coordinates(lat_raw, lng_raw)
        if coords is not None:
            room.distance_km = haversine_km(
                coords[0], coords[1], room.latitude, room.longitude
            )
        return room


class RoomJoinView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        room = get_object_or_404(ChatRoom, pk=pk, is_active=True)

        lat_raw, lng_raw = _extract_raw_coordinates(request.data, request.query_params)
        coords = _parse_coordinates(lat_raw, lng_raw)

        if coords is None:
            # If already an active member, allow entering without re-submitting location
            existing = RoomMembership.objects.filter(
                room=room, user=request.user, is_active=True
            ).first()
            if existing:
                serializer = RoomMembershipSerializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(
                {"detail": "Your location ('lat' and 'lng') is required to join this room."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_lat, user_lng = coords
        dist = haversine_km(user_lat, user_lng, room.latitude, room.longitude)
        if dist > float(room.radius_km):
            return Response(
                {
                    "detail": f"You are {dist:.2f} km away; room geofence radius is {room.radius_km} km.",
                    "distance_km": dist,
                    "radius_km": float(room.radius_km),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        membership, _ = RoomMembership.objects.get_or_create(
            room=room,
            user=request.user,
        )
        membership.is_active = True
        membership.save()

        serializer = RoomMembershipSerializer(membership)
        return Response(serializer.data, status=status.HTTP_200_OK)



class RoomLeaveView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        room = get_object_or_404(ChatRoom, pk=pk)
        membership = RoomMembership.objects.filter(
            room=room, user=request.user, is_active=True
        ).first()
        if not membership:
            return Response(
                {"detail": f"You are not an active member of room '{room.name}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        membership.is_active = False
        membership.save()
        return Response(
            {"detail": f"Left room '{room.name}'."},
            status=status.HTTP_200_OK,
        )


class RoomMemberListView(generics.ListAPIView):
    serializer_class = RoomMembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        room = get_object_or_404(ChatRoom, pk=self.kwargs['pk'], is_active=True)
        return RoomMembership.objects.filter(
            room=room, is_active=True
        ).select_related('user', 'room')


class RoomMessageListCreateView(generics.ListCreateAPIView):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MessagePagination
    throttle_scope = 'messages'

    def _get_active_room_and_membership(self):
        room = get_object_or_404(ChatRoom, pk=self.kwargs['pk'], is_active=True)
        is_member = RoomMembership.objects.filter(
            room=room, user=self.request.user, is_active=True
        ).exists()
        if not is_member:
            self.permission_denied(
                self.request,
                message="You must be an active member of this room to access or send messages.",
            )
        return room

    def get_queryset(self):
        room = self._get_active_room_and_membership()
        return (
            Message.objects.filter(room=room)
            .select_related('sender', 'room')
            .order_by('created_at', 'id')
        )

    def create(self, request, *args, **kwargs):
        room = self._get_active_room_and_membership()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(room=room, sender=self.request.user)
        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )        