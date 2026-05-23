export function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        await navigator.serviceWorker.register("/service-worker.js");
        console.log("✅ ConnectHive Live service worker registered");
      } catch (error) {
        console.error("❌ Service worker registration failed:", error);
      }
    });
  }
}