from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import ChatRoom
from .serializers import ChatRoomSerializer
from .utils import haversine_km


class ChatRoomListCreateView(generics.ListCreateAPIView):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = ChatRoom.objects.filter(is_active=True).select_related('created_by')

        # If this is a GET request, filter by location if lat & lng are provided
        if self.request.method == 'GET':
            lat_param = self.request.query_params.get('lat')
            lng_param = self.request.query_params.get('lng')
            radius_param = self.request.query_params.get('radius', '30')

            # Require both lat and lng if either one is supplied
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
                    # Room is visible if within the user's search radius OR the room's own geofence
                    effective_limit = max(search_radius, float(room.radius_km))
                    if dist <= effective_limit:
                        room.distance_km = dist
                        nearby_rooms.append(room)

                # Sort closest rooms first
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