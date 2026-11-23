from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from .models import Message, RoomMembership
from .moderation import has_abusive_content


class RoomChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"chat_room_{self.room_id}"

        can_access = await self._can_access_room(user.id, self.room_id)
        if not can_access:
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        user = self.scope["user"]
        raw_text = (content.get("content") or "").strip()

        if not raw_text:
            await self.send_json({"type": "error", "detail": "Message content cannot be empty."})
            return

        if len(raw_text) > 2000:
            await self.send_json({"type": "error", "detail": "Message exceeds 2000 characters."})
            return

        is_abusive = await database_sync_to_async(has_abusive_content)(raw_text)
        if is_abusive:
            await self.send_json({
                "type": "error",
                "detail": "Message contains abusive or inappropriate language and cannot be sent.",
            })
            return

        still_member = await self._can_access_room(user.id, self.room_id)
        if not still_member:
            await self.send_json({"type": "error", "detail": "You are no longer an active member of this room."})
            await self.close(code=4003)
            return

        msg = await self._create_message(user.id, self.room_id, raw_text)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat.message",
                "message": {
                    "id": msg.id,
                    "room": msg.room_id,
                    "sender_handle": user.handle,
                    "content": msg.content,
                    "created_at": msg.created_at.isoformat(),
                },
            },
        )

    async def chat_message(self, event):
        await self.send_json({
            "type": "message",
            "data": event["message"],
        })

    @database_sync_to_async
    def _can_access_room(self, user_id: int, room_id: int) -> bool:
        return RoomMembership.objects.filter(
            room_id=room_id,
            room__is_active=True,
            user_id=user_id,
            is_active=True,
        ).exists()

    @database_sync_to_async
    def _create_message(self, user_id: int, room_id: int, text: str) -> Message:
        return Message.objects.create(
            room_id=room_id,
            sender_id=user_id,
            content=text,
        )