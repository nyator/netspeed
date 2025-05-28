import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SplashScreen, Stack } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect } from "react";

import NetworkMonitor from './components/NetworkMonitor';

import './global.css';

export default function App() {

  const [fontsLoaded, error] = useFonts({
    "Satoshi-Black": require("./assets/fonts/Satoshi-Black.otf"),
    "Satoshi-Bold": require("./assets/fonts/Satoshi-Bold.otf"),
    "Satoshi-Light": require("./assets/fonts/Satoshi-Light.otf"),
    "Satoshi-Medium": require("./assets/fonts/Satoshi-Medium.otf"),
    "Satoshi-Regular": require("./assets/fonts/Satoshi-Regular.otf"),
  });

  useEffect(() => {
    SplashScreen.preventAutoHideAsync();
  }, []);

  useEffect(() => {
    if (error) throw error;

    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, error]);
  if (!fontsLoaded && !error) {
    return null;
  }


  return (
    // <View className='flex-1 max-w-3xl items-center justify-center'>
    //   <View className="flex-1 items-center justify-center">
    //     <Text className="text-3xl font-sBlack">Welcome to netspeed!</Text>
    //   </View>
    //   <StatusBar style="auto" />
    // </View>
    <NetworkMonitor />
  );
}
