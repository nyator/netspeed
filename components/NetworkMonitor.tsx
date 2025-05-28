import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  StatusBar,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";

import AntDesign from "@expo/vector-icons/AntDesign";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

const NetworkMonitor = () => {
  const [networkType, setNetworkType] = useState("");
  const [connected, setConnected] = useState(false);
  const [networkStrength, setNetworkStrength] = useState(0);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null);
  const [location, setLocation] = useState<{
    city?: string;
    region?: string;
    country?: string;
    org?: string;
  } | null>(null);

  const measurePing = async () => {
    try {
      const startTime = Date.now();
      const response = await fetch('https://www.google.com', { 
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      const endTime = Date.now();
      const pingTime = endTime - startTime;
      setPing(pingTime);
    } catch (error) {
      setPing(null);
    }
  };

  const measureDownloadSpeed = async () => {
    try {
      const startTime = Date.now();
      const response = await fetch('https://www.google.com/images/phd/px.gif');
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // Convert to seconds
      const fileSize = 43; // Size of the test file in bytes
      const speedMbps = (fileSize * 8) / (duration * 1000000); // Convert to Mbps
      setDownloadSpeed(Number(speedMbps.toFixed(2)));
    } catch (error) {
      setDownloadSpeed(null);
    }
  };

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkType(state.type);
      setConnected(state.isConnected ?? false);
      setNetworkStrength(state.isInternetReachable ? 1 : 0);
      if (state.isConnected) {
        measurePing();
        measureDownloadSpeed();
      }
    });

    // Set up interval for ping and download speed updates
    const speedInterval = setInterval(() => {
      if (connected) {
        measurePing();
        measureDownloadSpeed();
      }
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(speedInterval);
    };
  }, [connected]);

  useEffect(() => {
    const fetchIpAndLocation = async () => {
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        setIpAddress(ipData.ip);

        const locRes = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
        const locData = await locRes.json();
        setLocation({
          city: locData.city,
          region: locData.region,
          country: locData.country_name,
          org: locData.org,
        });
      } catch (e) {
        setIpAddress(null);
        setLocation(null);
      }
    };
    fetchIpAndLocation();
  }, []);

  const statusColor = connected ? "text-green-600" : "text-red-600";

  return (
    <View className="flex-1 items-center justify-start bg-zinc-900">
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
        animated
      />

      <View className="flex w-full max-w-lg bg-white border-[2px] border-[#a3a3a3] px-6 py-6 rounded-b-[3rem] shadow-lg pt-20 -mt-1">
        <View className="flex flex-row items-center justify-between px-3">
          <Text className="text-2xl text-center font-sBlack">netSpeed</Text>
          <Pressable
            className="text-lg text-center font-sMedium"
          >
            <AntDesign name="questioncircleo" size={24} color="black" />
          </Pressable>
        </View>
        <View className="flex flex-col items-center justify-between mt-6">
          <View className="flex flex-row items-center">
            <Ionicons name="wifi" size={24} color="#000" />
            <Text className="ml-2 text-lg font-sBold text-gray-800">
              {networkType}
            </Text>
          </View>
          <Text className={`text-lg font-sMedium ${statusColor}`}>
            {connected ? "Connected" : "Disconnected"}
          </Text>
          
        </View>
        
        <View className="flex flex-row items-center justify-between mt-6">
          {/* Ping Card */}
          <View className="rounded-3xl shadow-lg w-28 h-28 border-[1.2px] bg-[#FA633F]/5 border-[#FA633F] flex items-center justify-center">
            <View className="rounded-full bg-[#FA633F]/10 border border-[#FA633F]/20 p-2 ">
              <MaterialIcons name="network-ping" size={24} color="#FA633F" />
            </View>
            <Text className="text-center mt-1 font-sMedium text-[#FA633F]">
              Ping
            </Text>
            <Text className="text-center mt-1 font-sBold">
              {ping !== null ? ping : "N/A"}
              <Text className="font-sRegular"> ms</Text>
            </Text>
          </View>
          {/* Download Card */}
          <View className="rounded-3xl shadow-lg w-28 h-28 border-[1.2px] bg-[#57C785]/5 border-[#57C785] flex items-center justify-center">
            <View className="rounded-full bg-[#57C785]/10 border border-[#57C785]/20 p-2">
              <MaterialCommunityIcons
                name="download-network"
                size={24}
                color="#57C785"
              />
            </View>
            <Text className="text-center mt-1 font-sMedium text-[#57C785]">
              Download
            </Text>
            <Text className="text-center mt-1 font-sBold">
              {downloadSpeed !== null ? downloadSpeed : "N/A"}
              <Text className="font-sRegular"> Mb/s</Text>
            </Text>
          </View>
          {/* Upload Card */}
          <View className="rounded-3xl shadow-lg w-28 h-28 border-[1.2px] bg-[#0086FC]/5 border-[#0086FC] flex items-center justify-center">
            <View className="rounded-full bg-[#0086FC]/10 border border-[#0086FC]/20 p-2">
              <MaterialCommunityIcons
                name="upload-network"
                size={24}
                color="#0086FC"
              />
            </View>
            <Text className="text-center mt-1 font-sMedium text-[#0086FC]">
              Upload
            </Text>
            <Text className="text-center mt-1 font-sBold">
              {" "}
              N/A
              <Text className="font-sRegular"> (Mb/s)</Text>{" "}
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-1 items-center justify-center bg-[#0a1e27] border-[2px] border-[#254655] w-full max-w-lg rounded-t-[3rem] shadow-lg mt-6 -mb-1">
        <Text className="text-m text-white font-sBold mt-4 top-0 absolute">
          <Text className="text-[#57C785]">powered by </Text>nehtek
        </Text>
        <Text className="text-[4rem] text-white font-sBold relative">
          N/A
          <Text className="absolute top-0 text-lg">Mb/s</Text>
        </Text>
        <View className="mt-4 mb-2">
          <Text className="text-center text-xs font-sMedium text-gray-500">
            IP: {ipAddress ?? "Loading..."}
          </Text>
          <Text className="text-center text-xs font-sMedium text-gray-500">
            {location
              ? `${location.city ?? ""}${location.city ? ", " : ""}${location.region ?? ""}${location.region ? ", " : ""}${location.country ?? ""}`
              : "Locating..."}
          </Text>
          {location?.org && (
            <Text className="text-center text-xs font-sMedium text-gray-400">
              {location.org}
            </Text>
          )}
        </View>
      </View>

      <View className="flex w-52 h-24 bg-[#0086FC] border-[5px] border-[#fff] absolute bottom-10 px-6 py-6 rounded-full shadow-3xl items-center justify-center">
        <Pressable
          className="opacity-80"
          disabled={true}
        >
          <Text className="text-white text-center text-2xl font-sBold">
            Speed Test
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

export default NetworkMonitor;
