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

    def test_cors_headers_present_for_vite_dev_server(self):
        url = f"/api/chats/rooms/{self.room.id}/messages/"
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(url, HTTP_ORIGIN="http://localhost:5173")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access-control-allow-origin", response.headers)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")

    def test_nearby_rooms_filtering_by_location(self):
        # Room is at lat=12.9716, lng=77.5946, radius=30km
        self.client.force_authenticate(user=self.user2)

        # Within range (~5 km)
        res_near = self.client.get(
            "/api/chats/rooms/?lat=12.9352&lng=77.6245&radius=30"
        )
        self.assertEqual(res_near.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_near.data), 1)
        self.assertEqual(res_near.data[0]["id"], self.room.id)
        self.assertFalse(res_near.data[0]["is_member"])
        self.assertIsNotNone(res_near.data[0]["distance_km"])

        # Out of range (~60 km)
        res_far = self.client.get(
            "/api/chats/rooms/?lat=13.5000&lng=77.5946&radius=30"
        )
        self.assertEqual(res_far.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_far.data), 0)

    def test_geofence_enforced_on_joining_room(self):
        self.client.force_authenticate(user=self.user2)
        join_url = f"/api/chats/rooms/{self.room.id}/join/"

        # 1. Missing coordinates rejected
        res_no_coords = self.client.post(join_url, {})
        self.assertEqual(res_no_coords.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Too far (> 30 km) rejected
        res_too_far = self.client.post(join_url, {"lat": 13.5000, "lng": 77.5946})
        self.assertEqual(res_too_far.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("geofence radius", res_too_far.data["detail"])

        # 3. Within 30 km succeeds
        res_in_range = self.client.post(join_url, {"lat": 12.9352, "lng": 77.6245})
        self.assertEqual(res_in_range.status_code, status.HTTP_200_OK)
        self.assertTrue(res_in_range.data["is_active"])

        # 4. User can now send messages even if beyond 30 km
        msg_url = f"/api/chats/rooms/{self.room.id}/messages/"
        res_msg = self.client.post(
            msg_url,
            {"content": "Hello from afar", "lat": 28.6139, "lng": 77.2090},
        )
        self.assertEqual(res_msg.status_code, status.HTTP_201_CREATED)

        # 5. User can leave the room anytime
        leave_url = f"/api/chats/rooms/{self.room.id}/leave/"
        res_leave = self.client.post(leave_url)
        self.assertEqual(res_leave.status_code, status.HTTP_200_OK)
        self.assertFalse(
            RoomMembership.objects.filter(
                room=self.room, user=self.user2, is_active=True
            ).exists()
        )
