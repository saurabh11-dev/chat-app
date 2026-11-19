from django.urls import path
from .views import ChatRoomListCreateView

urlpatterns = [
    path('rooms/', ChatRoomListCreateView.as_view(), name='chatroom-list-create'),
]