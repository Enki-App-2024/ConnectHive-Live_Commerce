import { useEffect, useState } from "react";

export default function useDeviceMode() {
  const getMode = () => {
    const width = window.innerWidth;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    const userAgent = navigator.userAgent.toLowerCase();

    return {
      width,
      isMobile: width <= 768,
      isTablet: width > 768 && width <= 1024,
      isDesktop: width > 1024,
      isStandalone: standalone,
      isAndroid: userAgent.includes("android"),
      isIOS: /iphone|ipad|ipod/.test(userAgent),
      isBrowser: !standalone,
      canUseFloatingCompanion: width > 768 || standalone,
    };
  };

  const [deviceMode, setDeviceMode] = useState(getMode);

  useEffect(() => {
    const update = () => setDeviceMode(getMode());

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return deviceMode;
}