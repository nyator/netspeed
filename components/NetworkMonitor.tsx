import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  StatusBar,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";

import AntDesign from "@expo/vector-icons/AntDesign";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

const NetworkMonitor = () => {
  const [networkType, setNetworkType] = useState("");
  const [connected, setConnected] = useState(false);
  const [networkStrength, setNetworkStrength] = useState(0);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState<number | null>(null); // Add upload speed state
  const [location, setLocation] = useState<{
    emoji?: string;
    city?: string;
    region?: string;
    country?: string;
    org?: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLocating, setIsLocating] = useState(false); // Add this state
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);

  const refreshAllData = async () => {
    setIsRefreshing(true);
    setIsLocating(true);

    // Reset values before measuring
    setPing(0);
    setDownloadSpeed(0);
    setUploadSpeed(0);
    setIpAddress(null);
    setLocation(null);

    try {
      if (connected) {
        await measurePing();
        await measureDownloadSpeed();
        await measureUploadSpeed();
      }
      // Fetch IP
      const ipRes = await fetch("https://api.ipify.org?format=json");
      if (!ipRes.ok) throw new Error("Failed to fetch IP");
      const ipData = await ipRes.json();
      if (!ipData.ip) throw new Error("No IP in response");
      setIpAddress(ipData.ip);

      // Fetch Location from ipgeolocation.io
      const locData = await fetchLocationFromIpGeolocation(ipData.ip);
      setLocation({
        emoji: locData.emoji,
        city: locData.city,
        region: locData.region,
        country: locData.country,
        org: locData.org,
      });
    } catch (e) {
      console.error("refreshAllData error:", e);
      // Do NOT clear IP/location here, just keep the previous values
    } finally {
      setIsRefreshing(false);
      setIsLocating(false);
    }
  };

  const measurePing = async () => {
    try {
      const startTime = Date.now();
      const response = await fetch("https://www.google.com", {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-cache",
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
      const response = await fetch("https://www.google.com/images/phd/px.gif");
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // Convert to seconds
      // Size of the test file in bits
      const fileSize = 43 * 256; // 43KB (43 * 1024 bytes)
      const speedMbps = (fileSize * 8) / (duration * 1000000); // Convert to Mbps
      setDownloadSpeed(Number(speedMbps.toFixed(2)));
    } catch (error) {
      setDownloadSpeed(null);
    }
  };

  const measureUploadSpeed = async () => {
    try {
      const data = new Uint8Array(200 * 1024); // 200KB dummy data
      const startTime = Date.now();
      const response = await fetch("https://httpbin.org/post", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: data,
      });
      const endTime = Date.now();
      if (!response.ok) throw new Error("Upload failed");
      const duration = (endTime - startTime) / 1000; // seconds
      const fileSize = data.length; // bytes
      const speedMbps = (fileSize * 8) / (duration * 1000000); // Mbps
      setUploadSpeed(Number(speedMbps.toFixed(2)));
    } catch (error) {
      setUploadSpeed(null);
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
        measureUploadSpeed(); // Add upload speed test
      }
    });

    // Set up interval for ping and download/upload speed updates
    const speedInterval = setInterval(() => {
      if (connected) {
        measurePing();
        measureDownloadSpeed();
        measureUploadSpeed(); // Add upload speed test
      }
    }, 10000);

    return () => {
      unsubscribe();
      clearInterval(speedInterval);
    };
  }, [connected]);

  // Helper to fetch location from ipgeolocation.io (requires a free API key)
  const fetchLocationFromIpGeolocation = async (ip: string) => {
    const apiKey = "4a9d730c054b41ca9b52e1020a107aa5"; // Get a free API key from https://ipgeolocation.io/
    const url = `https://api.ipgeolocation.io/ipgeo?apiKey=${apiKey}&ip=${ip}`;
    const res = await fetch(url);
    if (!res.ok)
      throw new Error("Failed to fetch location from ipgeolocation.io");
    const data = await res.json();
    return {
      emoji: data.country_emoji,
      city: data.city,
      region: data.state_prov,
      country: data.country_name,
      org: data.organization,
    };
  };

  useEffect(() => {
    const fetchIpAndLocation = async () => {
      setIsLocating(true);
      try {
        // Fetch IP
        const ipRes = await fetch("https://api.ipify.org?format=json");
        if (!ipRes.ok) throw new Error("Failed to fetch IP");
        const ipData = await ipRes.json();
        if (!ipData.ip) throw new Error("No IP in response");
        setIpAddress(ipData.ip);

        // Fetch Location from ipgeolocation.io
        const locData = await fetchLocationFromIpGeolocation(ipData.ip);
        setLocation({
          emoji: locData.emoji,
          city: locData.city,
          region: locData.region,
          country: locData.country,
          org: locData.org,
        });
      } catch (e) {
        console.error("fetchIpAndLocation error:", e);
        // Do NOT clear IP/location here, just keep the previous values
      } finally {
        setIsLocating(false);
      }
    };
    fetchIpAndLocation();
  }, [connected, networkType]);

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
            onPress={() => setIsDrawerVisible(true)}
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
              {uploadSpeed !== null ? uploadSpeed : "N/A"}
              <Text className="font-sRegular"> (Mb/s)</Text>
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-1 items-center justify-center bg-[#0a1e27] border-[2px] border-[#254655] w-full max-w-lg rounded-t-[3rem] shadow-lg mt-6 -mb-1">
        <Text className="text-m text-white font-sBold mt-4 top-0 absolute">
          <Text className="text-[#57C785]">powered by </Text>nehtek
        </Text>
        <Text className="text-[4rem] -mt-20 text-white font-sBold relative">
          {downloadSpeed !== null ? downloadSpeed : "N/A"}
          <Text className="absolute top-0 text-lg">Mb/s</Text>
        </Text>
        <View className="mt-4 mb-2">
          <Text className="text-center text-xs font-sMedium text-gray-500">
            IP:{" "}
            {isLocating && !ipAddress
              ? "Fetching..."
              : ipAddress ?? "Unavailable"}
          </Text>
          <Text className="text-center text-xs font-sMedium text-gray-500">
            {isLocating && !location
              ? "Locating..."
              : location
              ? `${location.city ?? ""}${location.city ? ", " : ""}${
                  location.region ?? ""
                }${location.region ? ", " : ""}${location.country ?? ""}${
                  location.emoji ? ", " : ""
                }${location.emoji ?? ""}`
              : "Unavailable"}
          </Text>
          {location?.org && (
            <Text className="text-center text-xs font-sMedium text-gray-400">
              {location.org}
            </Text>
          )}
        </View>
      </View>

      <View className="flex w-52 h-24 bg-[#0086FC] border-[5px] border-[#fff] absolute bottom-10 px-6 py-6 rounded-full shadow-3xl items-center justify-center">
        <Pressable onPress={refreshAllData} disabled={isRefreshing}>
          {isRefreshing ? (
            <ActivityIndicator size="large" color="white" />
          ) : (
            <Text className="text-white text-center text-2xl font-sBold">
              Speed Test
            </Text>
          )}
        </Pressable>
      </View>

      {/* Bottom Drawer Modal */}
      <Modal
        visible={isDrawerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsDrawerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsDrawerVisible(false)}>
          <View className="flex-1 bg-black/30" />
        </TouchableWithoutFeedback>
        <View className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl px-6 pt-4 pb-8 min-h-[220px] items-center shadow-lg">
          <View className="w-10 h-1.5 rounded bg-gray-300 mb-3" />
          <Text className="text-xl font-sBold mb-2 text-zinc-800">
            About netSpeed
          </Text>
          <Text className="text-base font-sRegular text-zinc-700 text-center mb-5">
            This app measures your network speed, ping, and location. Tap "Speed
            Test" to refresh the results. Your IP and location are fetched from
            public APIs.
          </Text>
          <Pressable
            className="bg-[#0086FC] rounded-xl py-2 px-8"
            onPress={() => setIsDrawerVisible(false)}
          >
            <Text className="text-white font-sBold text-lg">Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
};

export default NetworkMonitor;
