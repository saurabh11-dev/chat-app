from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from .models import ChatRoom, Message, RoomMembership

User = get_user_model()


class RoomMessageHistoryTests(APITestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            email="user1@example.com",
            mobile_number="1234567890",
            password="password123",
            handle="TesterOne",
        )
        self.user2 = User.objects.create_user(
            email="user2@example.com",
            mobile_number="0987654321",
            password="password123",
            handle="TesterTwo",
        )
        self.room = ChatRoom.objects.create(
            name="Test Room",
            description="A test room",
            created_by=self.user1,
            latitude=Decimal("12.971600"),
            longitude=Decimal("77.594600"),
            radius_km=Decimal("30.00"),
            is_active=True,
        )
        self.membership1 = RoomMembership.objects.create(
            room=self.room,
            user=self.user1,
            is_active=True,
        )

    def test_unauthenticated_access_returns_401(self):
        url = f"/api/chats/rooms/{self.room.id}/messages/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_member_access_returns_403(self):
        url = f"/api/chats/rooms/{self.room.id}/messages/"
        self.client.force_authenticate(user=self.user2)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_active_member_can_fetch_messages_in_chronological_order(self):
        url = f"/api/chats/rooms/{self.room.id}/messages/"
        msg1 = Message.objects.create(room=self.room, sender=self.user1, content="First message")
        msg2 = Message.objects.create(room=self.room, sender=self.user1, content="Second message")
        msg3 = Message.objects.create(room=self.room, sender=self.user1, content="Third message")

        self.client.force_authenticate(user=self.user1)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get("results") if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0]["id"], msg1.id)
        self.assertEqual(results[0]["content"], "First message")
        self.assertEqual(results[0]["sender_handle"], "TesterOne")
        self.assertEqual(results[1]["id"], msg2.id)
        self.assertEqual(results[2]["id"], msg3.id)
