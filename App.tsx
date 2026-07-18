import { SplashScreen } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect } from "react";

import NetworkMonitor from "./components/NetworkMonitor";

import "./global.css";

// Must run before first render, not in an effect after it
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, error] = useFonts({
    "Satoshi-Black": require("./assets/fonts/Satoshi-Black.otf"),
    "Satoshi-Bold": require("./assets/fonts/Satoshi-Bold.otf"),
    "Satoshi-Light": require("./assets/fonts/Satoshi-Light.otf"),
    "Satoshi-Medium": require("./assets/fonts/Satoshi-Medium.otf"),
    "Satoshi-Regular": require("./assets/fonts/Satoshi-Regular.otf"),
  });

  useEffect(() => {
    // On font failure, log and continue with system fonts instead of crashing
    if (error) console.error("Font loading error:", error);
    if (fontsLoaded || error) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, error]);

  if (!fontsLoaded && !error) {
    return null;
  }

  return <NetworkMonitor />;
}
