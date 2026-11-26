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

    def test_room_discovery_and_detail_endpoints(self):
        inactive_room = ChatRoom.objects.create(
            name="Inactive Room",
            description="Closed",
            created_by=self.user1,
            latitude=Decimal("12.971600"),
            longitude=Decimal("77.594600"),
            radius_km=Decimal("30.00"),
            is_active=False,
        )

        # Unauthenticated requests return 401
        self.assertEqual(
            self.client.get("/api/chats/rooms/").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.assertEqual(
            self.client.get(f"/api/chats/rooms/{self.room.id}/").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.assertEqual(
            self.client.post(f"/api/chats/rooms/{self.room.id}/join/", {}).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        # Authenticated listing without coordinates returns only active rooms
        self.client.force_authenticate(user=self.user2)
        res_list = self.client.get("/api/chats/rooms/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertEqual([r["id"] for r in res_list.data], [self.room.id])
        self.assertFalse(res_list.data[0]["is_member"])

        # Discovery also accepts latitude/longitude query param aliases
        res_alias = self.client.get(
            "/api/chats/rooms/?latitude=12.9352&longitude=77.6245&radius=30"
        )
        self.assertEqual(res_alias.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_alias.data), 1)
        self.assertIsNotNone(res_alias.data[0]["distance_km"])

        # Room detail returns active room and 404 for inactive/missing room
        res_detail = self.client.get(
            f"/api/chats/rooms/{self.room.id}/?latitude=12.9352&longitude=77.6245"
        )
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertEqual(res_detail.data["name"], "Test Room")
        self.assertEqual(res_detail.data["member_count"], 1)
        self.assertIsNotNone(res_detail.data["distance_km"])

        self.assertEqual(
            self.client.get(f"/api/chats/rooms/{inactive_room.id}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.get("/api/chats/rooms/99999/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_join_room_validation_aliases_and_membership_lifecycle(self):
        inactive_room = ChatRoom.objects.create(
            name="Archived Room",
            created_by=self.user1,
            latitude=Decimal("12.971600"),
            longitude=Decimal("77.594600"),
            radius_km=Decimal("30.00"),
            is_active=False,
        )

        self.client.force_authenticate(user=self.user2)

        # Non-existent or inactive room returns 404
        self.assertEqual(
            self.client.post(
                "/api/chats/rooms/99999/join/",
                {"latitude": 12.9352, "longitude": 77.6245},
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.post(
                f"/api/chats/rooms/{inactive_room.id}/join/",
                {"latitude": 12.9352, "longitude": 77.6245},
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

        join_url = f"/api/chats/rooms/{self.room.id}/join/"

        # Partial or invalid coordinates rejected with 400
        self.assertEqual(
            self.client.post(join_url, {"latitude": 12.9352}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(join_url, {"latitude": 95.0, "longitude": 77.6}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(join_url, {"lat": "abc", "lng": "77.6"}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Outside geofence returns 400 with distance/radius details
        res_far = self.client.post(join_url, {"latitude": 13.5, "longitude": 77.5946})
        self.assertEqual(res_far.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("distance_km", res_far.data)
        self.assertIn("radius_km", res_far.data)

        # Join using latitude/longitude aliases succeeds
        res_join = self.client.post(
            join_url, {"latitude": 12.9352, "longitude": 77.6245}
        )
        self.assertEqual(res_join.status_code, status.HTTP_200_OK)
        self.assertTrue(res_join.data["is_active"])

        # Already active member can call join without coordinates and get 200
        res_reenter = self.client.post(join_url, {})
        self.assertEqual(res_reenter.status_code, status.HTTP_200_OK)
        self.assertTrue(res_reenter.data["is_active"])

        # Leave room -> message history access is revoked (403)
        self.assertEqual(
            self.client.post(f"/api/chats/rooms/{self.room.id}/leave/").status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get(f"/api/chats/rooms/{self.room.id}/messages/").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        # Re-joining after leaving still enforces geofence
        self.assertEqual(
            self.client.post(join_url, {"lat": 13.5, "lng": 77.5946}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(join_url, {"lat": 12.9352, "lng": 77.6245}).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get(f"/api/chats/rooms/{self.room.id}/messages/").status_code,
            status.HTTP_200_OK,
        )

    def test_joined_rooms_list_endpoint(self):
        other_room = ChatRoom.objects.create(
            name="Other Room",
            created_by=self.user1,
            latitude=Decimal("12.971600"),
            longitude=Decimal("77.594600"),
            radius_km=Decimal("30.00"),
            is_active=True,
        )
        inactive_room = ChatRoom.objects.create(
            name="Inactive Joined Room",
            created_by=self.user1,
            latitude=Decimal("12.971600"),
            longitude=Decimal("77.594600"),
            radius_km=Decimal("30.00"),
            is_active=False,
        )
        RoomMembership.objects.create(room=inactive_room, user=self.user2, is_active=True)

        # Unauthenticated rejected
        self.assertEqual(
            self.client.get("/api/chats/rooms/joined/").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        # user2 has no active rooms joined yet
        self.client.force_authenticate(user=self.user2)
        res_empty = self.client.get("/api/chats/rooms/joined/")
        self.assertEqual(res_empty.status_code, status.HTTP_200_OK)
        self.assertEqual(res_empty.data, [])

        # user1 is active member of self.room (not other_room)
        self.client.force_authenticate(user=self.user1)
        res_user1 = self.client.get("/api/chats/rooms/joined/")
        self.assertEqual(res_user1.status_code, status.HTTP_200_OK)
        self.assertEqual([r["id"] for r in res_user1.data], [self.room.id])
        self.assertTrue(res_user1.data[0]["is_member"])

        # ?joined=true query parameter also filters to joined active rooms
        res_query = self.client.get("/api/chats/rooms/?joined=true")
        self.assertEqual(res_query.status_code, status.HTTP_200_OK)
        self.assertEqual([r["id"] for r in res_query.data], [self.room.id])

        # Joining other_room includes it in joined rooms; leaving removes it
        RoomMembership.objects.create(room=other_room, user=self.user1, is_active=True)
        res_two = self.client.get("/api/chats/rooms/joined/")
        self.assertEqual(res_two.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_two.data), 2)

    def test_create_room_auto_membership_and_validation(self):
        create_url = "/api/chats/rooms/"

        # Unauthenticated creation returns 401
        res_anon = self.client.post(
            create_url,
            {"name": "Anon Room", "latitude": "25.289300", "longitude": "83.006400"},
        )
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(user=self.user2)

        # Validation errors (400): blank name, out-of-range coordinates, invalid radius
        self.assertEqual(
            self.client.post(
                create_url,
                {"name": "   ", "latitude": "25.289300", "longitude": "83.006400", "radius_km": "10.00"},
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                create_url,
                {"name": "Bad Lat", "latitude": "95.000000", "longitude": "83.006400", "radius_km": "10.00"},
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                create_url,
                {"name": "Bad Lng", "latitude": "25.289300", "longitude": "-185.000000", "radius_km": "10.00"},
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                create_url,
                {"name": "Zero Radius", "latitude": "25.289300", "longitude": "83.006400", "radius_km": "0"},
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                create_url,
                {"name": "Huge Radius", "latitude": "25.289300", "longitude": "83.006400", "radius_km": "600"},
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Successful creation using radius alias creates active membership for creator
        res_created = self.client.post(
            create_url,
            {
                "name": "Ghat Sunset Circle",
                "description": "Evening meetups",
                "latitude": "25.289300",
                "longitude": "83.006400",
                "radius": "15.00",
            },
        )
        self.assertEqual(res_created.status_code, status.HTTP_201_CREATED)
        new_room_id = res_created.data["id"]
        self.assertEqual(res_created.data["name"], "Ghat Sunset Circle")
        self.assertEqual(res_created.data["description"], "Evening meetups")
        self.assertEqual(res_created.data["latitude"], "25.289300")
        self.assertEqual(res_created.data["longitude"], "83.006400")
        self.assertEqual(res_created.data["radius"], "15.00")
        self.assertEqual(res_created.data["radius_km"], "15.00")
        self.assertEqual(res_created.data["created_by_handle"], self.user2.handle)
        self.assertTrue(res_created.data["is_member"])
        self.assertEqual(res_created.data["member_count"], 1)
        self.assertTrue(
            RoomMembership.objects.filter(
                room_id=new_room_id, user=self.user2, is_active=True
            ).exists()
        )

        # Creator sees new room in /joined/ and can immediately read/post messages
        res_joined = self.client.get("/api/chats/rooms/joined/")
        self.assertEqual(res_joined.status_code, status.HTTP_200_OK)
        self.assertIn(new_room_id, [r["id"] for r in res_joined.data])

        msg_url = f"/api/chats/rooms/{new_room_id}/messages/"
        self.assertEqual(self.client.get(msg_url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.post(msg_url, {"content": "Welcome!"}).status_code,
            status.HTTP_201_CREATED,
        )

    def test_leave_room_edge_cases(self):
        # Unauthenticated returns 401
        self.assertEqual(
            self.client.post(f"/api/chats/rooms/{self.room.id}/leave/").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        # Non-existent room returns 404
        self.client.force_authenticate(user=self.user2)
        self.assertEqual(
            self.client.post("/api/chats/rooms/99999/leave/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

        # Leaving a room when not an active member returns 400
        self.assertEqual(
            self.client.post(f"/api/chats/rooms/{self.room.id}/leave/").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Active member can leave -> 200, removed from /joined/, messages return 403
        self.client.force_authenticate(user=self.user1)
        res_leave = self.client.post(f"/api/chats/rooms/{self.room.id}/leave/")
        self.assertEqual(res_leave.status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get("/api/chats/rooms/joined/").data, [])
        self.assertEqual(
            self.client.get(f"/api/chats/rooms/{self.room.id}/messages/").status_code,
            status.HTTP_403_FORBIDDEN,
        )



