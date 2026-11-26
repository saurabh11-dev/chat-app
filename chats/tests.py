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

    def test_find_rooms_within_30km_discovery_filtering(self):
        """
        Verify that room discovery filters rooms within search_radius (default 30 km),
        calculates accurate distance_km, sorts results by distance ascending,
        supports both 'radius' and 'radius_km' query parameters, and includes rooms
        even if the room's individual geofence radius_km is smaller than 30 km.
        """
        self.client.force_authenticate(user=self.user2)

        # Base user location: Varanasi Cantt (25.3284, 82.9856)
        user_lat = 25.3284
        user_lng = 82.9856

        # Room A: ~4.5 km away, small room geofence (radius_km=5.0)
        room_near = ChatRoom.objects.create(
            name="Varanasi Ghats Room",
            description="Near ghats",
            created_by=self.user1,
            latitude=Decimal("25.310000"),
            longitude=Decimal("83.010000"),
            radius_km=Decimal("5.00"),
            is_active=True,
        )

        # Room B: ~17.5 km away, room geofence is 10.0 km
        # User is outside room's individual geofence, but WITHIN 30 km discovery radius
        room_mid = ChatRoom.objects.create(
            name="Sarnath Heritage Room",
            description="Historical zone",
            created_by=self.user1,
            latitude=Decimal("25.381100"),
            longitude=Decimal("83.021400"),
            radius_km=Decimal("10.00"),
            is_active=True,
        )

        # Room C: ~55 km away (outside 30 km)
        room_far = ChatRoom.objects.create(
            name="Jaunpur Outskirts Room",
            description="Too far away",
            created_by=self.user1,
            latitude=Decimal("25.750000"),
            longitude=Decimal("82.680000"),
            radius_km=Decimal("50.00"),
            is_active=True,
        )

        # 1. Query with radius=30
        res_30 = self.client.get(
            f"/api/chats/rooms/?lat={user_lat}&lng={user_lng}&radius=30"
        )
        self.assertEqual(res_30.status_code, status.HTTP_200_OK)
        returned_ids_30 = [r["id"] for r in res_30.data]

        # Room A and Room B must be included (both <= 30 km)
        self.assertIn(room_near.id, returned_ids_30)
        self.assertIn(room_mid.id, returned_ids_30)
        # Room C must be excluded (> 30 km)
        self.assertNotIn(room_far.id, returned_ids_30)

        # Check distances are calculated and sorted ascending
        distances = [r["distance_km"] for r in res_30.data if r["id"] in (room_near.id, room_mid.id)]
        self.assertEqual(distances, sorted(distances))
        for r in res_30.data:
            self.assertIsNotNone(r["distance_km"])
            self.assertLessEqual(r["distance_km"], 30.0)

        # 2. Query with 'radius_km=30' alias parameter
        res_alias = self.client.get(
            f"/api/chats/rooms/?lat={user_lat}&lng={user_lng}&radius_km=30"
        )
        self.assertEqual(res_alias.status_code, status.HTTP_200_OK)
        returned_ids_alias = [r["id"] for r in res_alias.data]
        self.assertIn(room_near.id, returned_ids_alias)
        self.assertIn(room_mid.id, returned_ids_alias)
        self.assertNotIn(room_far.id, returned_ids_alias)

        # 3. Empty state: search with remote coordinates returns 0 rooms
        res_empty = self.client.get(
            "/api/chats/rooms/?lat=0.0&lng=0.0&radius=30"
        )
        self.assertEqual(res_empty.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_empty.data), 0)

    def test_room_created_by_user_a_discovered_and_joined_by_user_b_at_exact_coordinates(self):
        """
        Account A creates a room with current coordinates (lat, lng) and radius.
        Account B queries GET /api/chats/rooms/?lat=<lat>&lng=<lng>&radius=30 using the exact same coordinates.
        Verify the created room IS returned with distance_km == 0 (and is_member == False).
        Account B can then join it via POST /api/chats/rooms/<id>/join/.
        """
        # User A creates room via POST /api/chats/rooms/
        self.client.force_authenticate(user=self.user1)
        test_lat = 25.289300
        test_lng = 83.006400

        res_create = self.client.post(
            "/api/chats/rooms/",
            {
                "name": "User A Varanasi Hangout",
                "description": "Room created by Account A",
                "latitude": test_lat,
                "longitude": test_lng,
                "radius_km": 30.00,
            },
        )
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        created_room_id = res_create.data["id"]
        self.assertTrue(res_create.data["is_member"])

        # Also create a room using short key aliases (lat, lng, radius)
        res_create_alias = self.client.post(
            "/api/chats/rooms/",
            {
                "name": "User A Short Key Room",
                "description": "Created with lat/lng/radius keys",
                "lat": test_lat,
                "lng": test_lng,
                "radius": 15.00,
            },
        )
        self.assertEqual(res_create_alias.status_code, status.HTTP_201_CREATED)
        alias_room_id = res_create_alias.data["id"]

        # User B queries 30 km discovery at exact same coordinates
        self.client.force_authenticate(user=self.user2)
        res_discover = self.client.get(
            f"/api/chats/rooms/?lat={test_lat}&lng={test_lng}&radius=30"
        )
        self.assertEqual(res_discover.status_code, status.HTTP_200_OK)

        discovered_room = next(
            (r for r in res_discover.data if r["id"] == created_room_id),
            None,
        )
        self.assertIsNotNone(discovered_room, "Created room must appear in discovery results for User B")
        self.assertEqual(discovered_room["distance_km"], 0.0)
        self.assertFalse(discovered_room["is_member"])

        discovered_alias_room = next(
            (r for r in res_discover.data if r["id"] == alias_room_id),
            None,
        )
        self.assertIsNotNone(discovered_alias_room, "Alias created room must appear in discovery results")
        self.assertEqual(discovered_alias_room["distance_km"], 0.0)
        self.assertFalse(discovered_alias_room["is_member"])

        # Discovery using 'lon' alias also returns the rooms
        res_lon = self.client.get(
            f"/api/chats/rooms/?lat={test_lat}&lon={test_lng}&radius=30"
        )
        self.assertEqual(res_lon.status_code, status.HTTP_200_OK)
        self.assertIn(created_room_id, [r["id"] for r in res_lon.data])

        # User B can join via POST /api/chats/rooms/<id>/join/
        join_url = f"/api/chats/rooms/{created_room_id}/join/"
        res_join = self.client.post(
            join_url,
            {"lat": test_lat, "lng": test_lng},
        )
        self.assertEqual(res_join.status_code, status.HTTP_200_OK)
        self.assertTrue(res_join.data["is_active"])
        self.assertEqual(res_join.data["handle"], self.user2.handle)

    def test_user_b_joins_room_at_same_gps_coordinates_without_distance_error(self):
        """
        Regression test:
        User A creates a room at GPS coordinates (25.354483, 84.024375) with 30 km radius.
        User B joins using the exact same coordinates.
        Verify distance computes to ~0.00 km and join succeeds with 200 OK.
        Verify joining from stale fallback coordinates (25.289300, 83.006400) fails with 102.58 km error.
        """
        user_a_lat = 25.354483
        user_a_lng = 84.024375

        # 1. User A creates room
        self.client.force_authenticate(user=self.user1)
        res_create = self.client.post(
            "/api/chats/rooms/",
            {
                "name": "Buxar GPS Room",
                "description": "Created at User A GPS location",
                "latitude": user_a_lat,
                "longitude": user_a_lng,
                "radius": 30.00,
            },
        )
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        room_id = res_create.data["id"]

        # 2. User B joins using the EXACT SAME coordinates -> must succeed (distance = 0 km)
        self.client.force_authenticate(user=self.user2)
        join_url = f"/api/chats/rooms/{room_id}/join/"
        res_join_same = self.client.post(
            join_url,
            {"lat": user_a_lat, "lng": user_a_lng},
        )
        self.assertEqual(res_join_same.status_code, status.HTTP_200_OK)
        self.assertTrue(res_join_same.data["is_active"])
        self.assertTrue(
            RoomMembership.objects.filter(
                room_id=room_id, user=self.user2, is_active=True
            ).exists()
        )

        # 3. User B leaves the room
        self.client.post(f"/api/chats/rooms/{room_id}/leave/")
        self.assertFalse(
            RoomMembership.objects.filter(
                room_id=room_id, user=self.user2, is_active=True
            ).exists()
        )

        # 4. User B attempts to join with stale fallback coordinates (Assi Ghat: 25.289300, 83.006400)
        # Distance between (25.354483, 84.024375) and (25.289300, 83.006400) is 102.58 km
        stale_lat = 25.289300
        stale_lng = 83.006400
        res_join_stale = self.client.post(
            join_url,
            {"lat": stale_lat, "lng": stale_lng},
        )
        self.assertEqual(res_join_stale.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("102.57 km away", res_join_stale.data.get("error", ""))
        self.assertIn("radius is 30.00 km", res_join_stale.data.get("error", ""))





