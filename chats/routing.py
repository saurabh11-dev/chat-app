from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"^ws/chats/rooms/(?P<room_id>\d+)/$", consumers.RoomChatConsumer.as_asgi()),
]