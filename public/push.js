import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";
import { app, auth, db } from "./firebase-init.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const messaging = getMessaging(app);
const VAPID_KEY = "BJXquI0uOjdous3LT5l8yIfRYZ6vo3Ie6MBWHcUIKKuW3gjzHVfoyxvGJXZZIQaozOLI_xOR3DP-Uj2m5nTP15s";

async function initPush() {
  console.log("[push] initPush called");

  if (!("Notification" in window)) {
    console.log("[push] Browserul nu suporta notificari.");
    return null;
  }

  if (!("serviceWorker" in navigator)) {
    console.log("[push] Browserul nu suporta service worker.");
    return null;
  }

  console.log("[push] current Notification.permission =", Notification.permission);

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  console.log("[push] service worker registered", registration);

  let permission = Notification.permission;

  if (permission !== "granted") {
    permission = await Notification.requestPermission();
    console.log("[push] permission after request =", permission);
  }

  if (permission !== "granted") {
    console.log("[push] Push permission not granted");
    return null;
  }

  const user = auth.currentUser;
  if (!user) {
    console.log("[push] Nu esti logat.");
    return null;
  }

  console.log("[push] user uid =", user.uid);

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration
  });

  console.log("[push] token result =", token);

  if (!token) {
    console.log("[push] Nu am primit token FCM.");
    return null;
  }

  await setDoc(doc(db, "users", user.uid, "tokens", token), {
    token,
    createdAt: Date.now()
  }, { merge: true });

  console.log("[push] Push token saved:", token);
  return token;
}

window.requestPushFromUserGesture = initPush;
console.log("[push] requestPushFromUserGesture set on window");
console.log("[push] push.js loaded");

onMessage(messaging, (payload) => {
  console.log("[push] Foreground push:", payload);

  const title = payload?.notification?.title || "Notificare noua";
  const body = payload?.notification?.body || "";

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: "/assets/favicon.svg"
    });
  }
});