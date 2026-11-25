from django.urls import path
from .views import (
    ChatRoomDetailView,
    ChatRoomListCreateView,
    JoinedRoomListView,
    RoomJoinView,
    RoomLeaveView,
    RoomMemberListView,
    RoomMessageListCreateView,
)

urlpatterns = [
    path('rooms/', ChatRoomListCreateView.as_view(), name='chatroom-list-create'),
    path('rooms/joined/', JoinedRoomListView.as_view(), name='chatroom-joined-list'),
    path('rooms/<int:pk>/', ChatRoomDetailView.as_view(), name='chatroom-detail'),
    path('rooms/<int:pk>/join/', RoomJoinView.as_view(), name='chatroom-join'),
    path('rooms/<int:pk>/leave/', RoomLeaveView.as_view(), name='chatroom-leave'),
    path('rooms/<int:pk>/members/', RoomMemberListView.as_view(), name='chatroom-members'),
    path('rooms/<int:pk>/messages/', RoomMessageListCreateView.as_view(), name='chatroom-messages'),
]