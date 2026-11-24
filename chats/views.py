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


class ChatRoomListCreateView(generics.ListCreateAPIView):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = ChatRoom.objects.filter(is_active=True).select_related('created_by')

        if self.request.method == 'GET':
            lat_param = self.request.query_params.get('lat')
            lng_param = self.request.query_params.get('lng')
            radius_param = self.request.query_params.get('radius', '30')

            if (lat_param is not None and lng_param is None) or (
                lng_param is not None and lat_param is None
            ):
                raise ValidationError(
                    {"detail": "Both 'lat' and 'lng' query parameters are required together."}
                )

            if lat_param is not None and lng_param is not None:
                try:
                    user_lat = float(lat_param)
                    user_lng = float(lng_param)
                    search_radius = float(radius_param)
                except ValueError:
                    raise ValidationError(
                        {"detail": "'lat', 'lng', and 'radius' must be valid numbers."}
                    )

                if not (-90 <= user_lat <= 90) or not (-180 <= user_lng <= 180):
                    raise ValidationError(
                        {"detail": "Coordinates out of range (lat: -90..90, lng: -180..180)."}
                    )
                if search_radius <= 0:
                    raise ValidationError(
                        {"detail": "'radius' must be greater than 0."}
                    )

                nearby_rooms = []
                for room in queryset:
                    dist = haversine_km(
                        user_lat, user_lng, room.latitude, room.longitude
                    )
                    effective_limit = max(search_radius, float(room.radius_km))
                    if dist <= effective_limit:
                        room.distance_km = dist
                        nearby_rooms.append(room)

                nearby_rooms.sort(key=lambda r: r.distance_km)
                return nearby_rooms

        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )


class RoomJoinView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        room = get_object_or_404(ChatRoom, pk=pk, is_active=True)

        lat = request.data.get('lat') or request.query_params.get('lat')
        lng = request.data.get('lng') or request.query_params.get('lng')

        if (lat is not None and lng is None) or (lng is not None and lat is None):
            return Response(
                {"detail": "Provide both 'lat' and 'lng' together."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if lat is not None and lng is not None:
            try:
                user_lat = float(lat)
                user_lng = float(lng)
            except ValueError:
                return Response(
                    {"detail": "'lat' and 'lng' must be valid numbers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not (-90 <= user_lat <= 90) or not (-180 <= user_lng <= 180):
                return Response(
                    {"detail": "Coordinates out of range."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            dist = haversine_km(user_lat, user_lng, room.latitude, room.longitude)
            if dist > float(room.radius_km):
                return Response(
                    {
                        "detail": f"You are {dist} km away; room geofence radius is {room.radius_km} km."
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
        membership = get_object_or_404(
            RoomMembership, room=room, user=request.user, is_active=True
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

        lat = request.data.get('lat') or request.query_params.get('lat')
        lng = request.data.get('lng') or request.query_params.get('lng')

        if (lat is not None and lng is None) or (lng is not None and lat is None):
            return Response(
                {"detail": "Provide both 'lat' and 'lng' together."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if lat is not None and lng is not None:
            try:
                user_lat = float(lat)
                user_lng = float(lng)
            except ValueError:
                return Response(
                    {"detail": "'lat' and 'lng' must be valid numbers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not (-90 <= user_lat <= 90) or not (-180 <= user_lng <= 180):
                return Response(
                    {"detail": "Coordinates out of range."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            dist = haversine_km(user_lat, user_lng, room.latitude, room.longitude)
            if dist > float(room.radius_km):
                return Response(
                    {
                        "detail": f"You are {dist} km away; room geofence radius is {room.radius_km} km."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(room=room, sender=self.request.user)
        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )        