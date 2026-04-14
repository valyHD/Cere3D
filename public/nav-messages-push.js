function bindMessagesNavPushDelegated() {
  if (window.__cere3dMessagesPushBound) return;
  window.__cere3dMessagesPushBound = true;

  console.log("[nav-messages-push] delegated bind activ");

  document.addEventListener("click", function (event) {
    const link = event.target && event.target.closest
      ? event.target.closest("a#navMessages")
      : null;

    if (!link) return;

    console.log("[nav-messages-push] click delegat pe Mesaje");

    if (!window.requestPushFromUserGesture) {
      console.log("[nav-messages-push] requestPushFromUserGesture lipseste");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    Promise.resolve()
      .then(() => window.requestPushFromUserGesture())
      .catch((e) => {
        console.warn("[nav-messages-push] push request failed:", e);
      })
      .finally(() => {
        window.location.href = "/mesaje.html";
      });

    return false;
  }, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindMessagesNavPushDelegated);
} else {
  bindMessagesNavPushDelegated();
}