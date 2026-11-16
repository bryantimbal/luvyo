# Notifications

**What works today (no external setup):**
- In-app notification centre (`#/notifications`) with unread badge
- Departure reminders. They fire while the app is open and use the Web Notification API if permitted
- New-advisory alerts (once each; the first launch is not flooded) and community report status changes
- Per-type preferences in Settings

**Background push (FCM):**
1. Create a Firebase project and add a Web app. Generate a VAPID key pair.
2. On the client, after permission is granted, call `getToken` from the Firebase Messaging SDK with
   the VAPID key and the existing service worker registration (`/sw.js` already handles `push` and
   `notificationclick`). Store the token in `user_preferences.fcm_tokens` (RLS: own row).
3. On the server, when an advisory is published (admin portal → Advisories), look up users whose
   `saved_routes` touch the advisory's `route_ids` or `area_geom` and who have
   `notif_advisories = true`. Send through the FCM HTTP v1 API using a service account, server-side
   only.
4. Rate-limit to avoid excessive notifications: at most one advisory push per user per route per
   6 hours.
