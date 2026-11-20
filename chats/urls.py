from django.urls import path
from .views import (
    ChatRoomListCreateView,
    RoomJoinView,
    RoomLeaveView,
    RoomMemberListView,
    RoomMessageListCreateView,
)

urlpatterns = [
    path('rooms/', ChatRoomListCreateView.as_view(), name='chatroom-list-create'),
    path('rooms/<int:pk>/join/', RoomJoinView.as_view(), name='chatroom-join'),
    path('rooms/<int:pk>/leave/', RoomLeaveView.as_view(), name='chatroom-leave'),
    path('rooms/<int:pk>/members/', RoomMemberListView.as_view(), name='chatroom-members'),
    path('rooms/<int:pk>/messages/', RoomMessageListCreateView.as_view(), name='chatroom-messages'),
]