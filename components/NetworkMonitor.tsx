import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StatusBar,
  Modal,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import Svg, { Path, Line, Circle, Text as SvgText } from "react-native-svg";

import AntDesign from "@expo/vector-icons/AntDesign";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

// Cloudflare serves exact-size payloads, so measured bytes are real
const DOWNLOAD_URL = "https://speed.cloudflare.com/__down";
const UPLOAD_URL = "https://speed.cloudflare.com/__up";
const PING_URL = "https://www.gstatic.com/generate_204";

const PING_SAMPLES = 5;
const TEST_DURATION_MS = 8_000; // per direction on the main test
const DOWNLOAD_CHUNK_BYTES = 25_000_000; // looped until the time window closes
// Upload chunks start small so slow links finish some, and grow so fast
// links aren't throttled by per-chunk round trips
const UPLOAD_CHUNK_START = 1_000_000;
const UPLOAD_CHUNK_MAX = 16_000_000;
// Light one-shot payloads for the small cards
const QUICK_DOWNLOAD_BYTES = 200_000;
const QUICK_UPLOAD_BYTES = 100_000;

const GEO_API_KEY =
  process.env.EXPO_PUBLIC_IPGEOLOCATION_API_KEY ??
  "4a9d730c054b41ca9b52e1020a107aa5";

const COLOR_PING = "#FA633F";
const COLOR_DOWN = "#57C785";
const COLOR_UP = "#0086FC";
const COLOR_TRACK = "#1c3a48";
const COLOR_TICK = "#557080";

type TestPhase = "idle" | "ping" | "download" | "upload" | "done";

// ---------- measurement helpers ----------

// Best sample = ping; mean successive difference = jitter
const runPingPhase = async (
  samples: number = PING_SAMPLES
): Promise<{ ping: number | null; jitter: number | null }> => {
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    try {
      const start = Date.now();
      await fetch(`${PING_URL}?t=${Date.now()}-${i}`, {
        method: "HEAD",
        cache: "no-store",
      });
      times.push(Date.now() - start);
    } catch {
      // skip failed sample
    }
  }
  if (times.length === 0) return { ping: null, jitter: null };
  const ping = Math.min(...times);
  let jitter: number | null = null;
  if (times.length > 1) {
    let sum = 0;
    for (let i = 1; i < times.length; i++) {
      sum += Math.abs(times[i] - times[i - 1]);
    }
    jitter = Math.round(sum / (times.length - 1));
  }
  return { ping, jitter };
};

// Downloads one chunk, reporting incremental progress; resolves with bytes
// actually transferred (aborts itself when timeLimitMs runs out).
const downloadChunk = (
  bytes: number,
  timeLimitMs: number,
  onProgress: (chunkLoaded: number) => void
): Promise<number | null> =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let latest = 0;
    let settled = false;
    const done = (v: number | null) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(v);
      }
    };
    const timer = setTimeout(() => xhr.abort(), Math.max(timeLimitMs, 250));
    xhr.open(
      "GET",
      `${DOWNLOAD_URL}?bytes=${bytes}&t=${Date.now()}-${Math.random()}`
    );
    xhr.responseType = "blob";
    xhr.onprogress = (e) => {
      latest = e.loaded;
      onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (latest === 0 && xhr.response?.size) latest = xhr.response.size;
      done(latest);
    };
    xhr.onabort = () => done(latest);
    xhr.onerror = () => done(latest > 0 ? latest : null);
    xhr.send();
  });

const uploadChunk = (
  body: string,
  timeLimitMs: number,
  onProgress: (chunkLoaded: number) => void
): Promise<number | null> =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let latest = 0;
    let settled = false;
    const done = (v: number | null) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(v);
      }
    };
    const timer = setTimeout(() => xhr.abort(), Math.max(timeLimitMs, 250));
    xhr.open("POST", `${UPLOAD_URL}?t=${Date.now()}-${Math.random()}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      latest = e.loaded;
      onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (latest === 0) latest = body.length;
      done(latest);
    };
    xhr.onabort = () => done(latest);
    xhr.onerror = () => done(latest > 0 ? latest : null);
    xhr.send(body);
  });

// Loops chunk transfers for a fixed wall-clock window, streaming a smoothed
// live speed; returns the sustained average in Mbps.
const runTimedTransfer = async (
  transferChunk: (
    timeLimitMs: number,
    onProgress: (chunkLoaded: number) => void
  ) => Promise<number | null>,
  onSpeed: (mbps: number) => void
): Promise<number | null> => {
  const testStart = Date.now();
  let totalBytes = 0;
  let ema = 0;
  let lastTick = testStart;
  let lastGlobalLoaded = 0;

  while (Date.now() - testStart < TEST_DURATION_MS) {
    const remaining = TEST_DURATION_MS - (Date.now() - testStart);
    const got = await transferChunk(remaining, (chunkLoaded) => {
      const globalLoaded = totalBytes + chunkLoaded;
      const now = Date.now();
      const dt = (now - lastTick) / 1000;
      if (dt >= 0.2) {
        const inst = ((globalLoaded - lastGlobalLoaded) * 8) / (dt * 1_000_000);
        ema = ema > 0 ? ema * 0.65 + inst * 0.35 : inst;
        onSpeed(Number(ema.toFixed(1)));
        lastTick = now;
        lastGlobalLoaded = globalLoaded;
      }
    });
    if (got === null) break; // network error — stop the loop
    totalBytes += got;
  }

  const duration = (Date.now() - testStart) / 1000;
  if (duration < 0.5 || totalBytes < 50_000) return null;
  return Number(((totalBytes * 8) / (duration * 1_000_000)).toFixed(2));
};

// One small transfer, timed around the chunk call — enough for the cards
const quickDownloadMbps = async (): Promise<number | null> => {
  const start = Date.now();
  const got = await downloadChunk(QUICK_DOWNLOAD_BYTES, 6_000, () => {});
  const dt = (Date.now() - start) / 1000;
  if (got === null || got === 0 || dt <= 0) return null;
  return Number(((got * 8) / (dt * 1_000_000)).toFixed(2));
};

const quickUploadMbps = async (): Promise<number | null> => {
  const body = "x".repeat(QUICK_UPLOAD_BYTES);
  const start = Date.now();
  const got = await uploadChunk(body, 6_000, () => {});
  const dt = (Date.now() - start) / 1000;
  if (got === null || got === 0 || dt <= 0) return null;
  return Number(((got * 8) / (dt * 1_000_000)).toFixed(2));
};

// ---------- speedometer ----------

const GAUGE_TICKS = [0, 1, 5, 10, 20, 30, 50, 75, 100];
const GAUGE_START = -135; // degrees, 0 = straight up
const GAUGE_SWEEP = 270;

// Piecewise-linear scale between tick values (speedtest-style)
const speedToFraction = (mbps: number): number => {
  if (mbps <= 0) return 0;
  const segments = GAUGE_TICKS.length - 1;
  if (mbps >= GAUGE_TICKS[segments]) return 1;
  for (let i = 0; i < segments; i++) {
    const v0 = GAUGE_TICKS[i];
    const v1 = GAUGE_TICKS[i + 1];
    if (mbps <= v1) return (i + (mbps - v0) / (v1 - v0)) / segments;
  }
  return 1;
};

const polar = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const arcPath = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
) => {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
};

const Gauge = ({ speed, color }: { speed: number; color: string }) => {
  const size = 280;
  const cx = size / 2;
  const cy = 145;
  const r = 110;
  const fraction = speedToFraction(speed);
  const angle = GAUGE_START + GAUGE_SWEEP * fraction;
  const needleEnd = polar(cx, cy, r - 32, angle);

  return (
    <Svg width={size} height={238}>
      {/* track */}
      <Path
        d={arcPath(cx, cy, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP)}
        stroke={COLOR_TRACK}
        strokeWidth={14}
        strokeLinecap="round"
        fill="none"
      />
      {/* progress */}
      {fraction > 0.005 && (
        <Path
          d={arcPath(cx, cy, r, GAUGE_START, angle)}
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          fill="none"
        />
      )}
      {/* tick labels */}
      {GAUGE_TICKS.map((tick, i) => {
        const a = GAUGE_START + (GAUGE_SWEEP * i) / (GAUGE_TICKS.length - 1);
        const pos = polar(cx, cy, r - 32, a);
        return (
          <SvgText
            key={tick}
            x={pos.x}
            y={pos.y + 4}
            fill={COLOR_TICK}
            fontSize={11}
            fontWeight="600"
            textAnchor="middle"
          >
            {tick}
          </SvgText>
        );
      })}
      {/* needle */}
      <Line
        x1={cx}
        y1={cy}
        x2={needleEnd.x}
        y2={needleEnd.y}
        stroke="#ffffff"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Circle cx={cx} cy={cy} r={6} fill={color} />
    </Svg>
  );
};

// ---------- stat tile ----------

// Fill fractions for the little quality bars: lower ping is better;
// speeds use a log scale so slow links still show something meaningful
const pingFill = (ms: number | null) =>
  ms === null ? 0 : Math.max(0.04, Math.min(1, 1 - ms / 300));
const speedFill = (mbps: number | null) =>
  mbps === null ? 0 : Math.max(0.04, Math.min(1, Math.log10(mbps + 1) / 2));

const StatTile = ({
  color,
  icon,
  label,
  value,
  unit,
  sub,
  fill,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  sub?: string;
  fill: number;
}) => (
  <View
    className="flex-1 mx-1 rounded-3xl border-[1.2px] px-3 pt-3 pb-3 shadow-lg"
    style={{ backgroundColor: `${color}0D`, borderColor: color }}
  >
    <View className="flex flex-row items-center">
      <View
        className="rounded-full p-1.5 border"
        style={{ backgroundColor: `${color}1A`, borderColor: `${color}33` }}
      >
        {icon}
      </View>
      <Text className="ml-1.5 text-[11px] font-sMedium" style={{ color }}>
        {label}
      </Text>
    </View>
    <Text className="mt-2 text-xl text-zinc-800 font-sBold" numberOfLines={1}>
      {value}
      <Text className="text-[11px] text-zinc-500 font-sRegular"> {unit}</Text>
    </Text>
    <Text className="text-[9px] text-zinc-400 font-sRegular" numberOfLines={1}>
      {sub ?? " "}
    </Text>
    <View className="mt-1.5 h-1 rounded-full bg-zinc-200 overflow-hidden">
      <View
        className="h-1 rounded-full"
        style={{ width: `${Math.round(fill * 100)}%`, backgroundColor: color }}
      />
    </View>
  </View>
);

// ---------- component ----------

const NetworkMonitor = () => {
  const [networkType, setNetworkType] = useState("");
  const [connected, setConnected] = useState(false);
  const [ping, setPing] = useState<number | null>(null);
  const [jitter, setJitter] = useState<number | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState<number | null>(null);
  const [mainDownloadSpeed, setMainDownloadSpeed] = useState<number | null>(null);
  const [mainUploadSpeed, setMainUploadSpeed] = useState<number | null>(null);
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [phase, setPhase] = useState<TestPhase>("idle");
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [location, setLocation] = useState<{
    emoji?: string;
    city?: string;
    region?: string;
    country?: string;
    org?: string;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);

  const runningRef = useRef(false);
  const connectedRef = useRef(false);

  const isTesting =
    phase === "ping" || phase === "download" || phase === "upload";

  // Populate the small cards with one light measurement round
  const quickMeasure = async () => {
    if (!connectedRef.current || runningRef.current) return;
    const { ping: pingMs, jitter: jitterMs } = await runPingPhase(2);
    if (runningRef.current) return; // a main test started meanwhile
    setPing(pingMs);
    setJitter(jitterMs);
    const [dl, ul] = await Promise.all([
      quickDownloadMbps(),
      quickUploadMbps(),
    ]);
    if (runningRef.current) return;
    setDownloadSpeed(dl);
    setUploadSpeed(ul);
  };

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected ?? false;
      const wasConnected = connectedRef.current;
      connectedRef.current = isConnected;
      setNetworkType(state.type);
      setConnected(isConnected);
      if (isConnected && !wasConnected) {
        quickMeasure();
      } else if (!isConnected) {
        setPing(null);
        setJitter(null);
        setDownloadSpeed(null);
        setUploadSpeed(null);
      }
    });

    // Keep only the ping fresh in the background — it costs almost no data
    const pingInterval = setInterval(async () => {
      if (!connectedRef.current || runningRef.current) return;
      const { ping: pingMs, jitter: jitterMs } = await runPingPhase(2);
      if (!runningRef.current) {
        setPing(pingMs);
        setJitter(jitterMs);
      }
    }, 15_000);

    return () => {
      unsubscribe();
      clearInterval(pingInterval);
    };
  }, []);

  const fetchIpAndLocation = async () => {
    setIsLocating(true);
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json");
      if (!ipRes.ok) throw new Error("Failed to fetch IP");
      const ipData = await ipRes.json();
      if (!ipData.ip) throw new Error("No IP in response");
      setIpAddress(ipData.ip);

      const geoRes = await fetch(
        `https://api.ipgeolocation.io/ipgeo?apiKey=${GEO_API_KEY}&ip=${ipData.ip}`
      );
      if (!geoRes.ok) throw new Error("Failed to fetch location");
      const geo = await geoRes.json();
      setLocation({
        emoji: geo.country_emoji,
        city: geo.city,
        region: geo.state_prov,
        country: geo.country_name,
        org: geo.organization,
      });
    } catch (e) {
      console.error("fetchIpAndLocation error:", e);
      // Keep previous values on failure
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    if (connected) fetchIpAndLocation();
  }, [connected, networkType]);

  // Full test: ping → download → upload, all shown live
  const runSpeedTest = async () => {
    if (runningRef.current || !connectedRef.current) return;
    runningRef.current = true;

    setPing(null);
    setJitter(null);
    setMainDownloadSpeed(null);
    setMainUploadSpeed(null);
    setLiveSpeed(0);

    try {
      setPhase("ping");
      const { ping: pingMs, jitter: jitterMs } = await runPingPhase();
      setPing(pingMs);
      setJitter(jitterMs);

      setPhase("download");
      setLiveSpeed(0);
      const down = await runTimedTransfer(
        (timeLimitMs, onProgress) =>
          downloadChunk(DOWNLOAD_CHUNK_BYTES, timeLimitMs, onProgress),
        (mbps) => {
          setLiveSpeed(mbps);
          setDownloadSpeed(mbps);
        }
      );
      setMainDownloadSpeed(down);
      setDownloadSpeed(down);

      setPhase("upload");
      setLiveSpeed(0);
      const base = "x".repeat(UPLOAD_CHUNK_MAX);
      let upChunkBytes = UPLOAD_CHUNK_START;
      const up = await runTimedTransfer(
        async (timeLimitMs, onProgress) => {
          const started = Date.now();
          const size = upChunkBytes;
          const got = await uploadChunk(
            base.slice(0, size),
            timeLimitMs,
            onProgress
          );
          if (got !== null && got >= size && Date.now() - started < 2000) {
            upChunkBytes = Math.min(upChunkBytes * 2, UPLOAD_CHUNK_MAX);
          }
          return got;
        },
        (mbps) => {
          setLiveSpeed(mbps);
          setUploadSpeed(mbps);
        }
      );
      setMainUploadSpeed(up);
      setUploadSpeed(up);

      setPhase("done");
      fetchIpAndLocation();
    } catch (e) {
      console.error("runSpeedTest error:", e);
      setPhase("done");
    } finally {
      runningRef.current = false;
    }
  };

  const gaugeSpeed =
    phase === "download" || phase === "upload"
      ? liveSpeed
      : mainDownloadSpeed ?? 0;
  const gaugeColor = phase === "upload" ? COLOR_UP : COLOR_DOWN;

  const bigNumber =
    phase === "ping"
      ? "…"
      : phase === "download" || phase === "upload"
        ? liveSpeed.toFixed(1)
        : mainDownloadSpeed !== null
          ? `${mainDownloadSpeed}`
          : "—";

  const phaseLabel =
    phase === "ping"
      ? "Measuring ping…"
      : phase === "download"
        ? "Testing download…"
        : phase === "upload"
          ? "Testing upload…"
          : phase === "idle"
            ? "Tap Speed Test to begin"
            : null;

  return (
    <View className="flex-1 justify-start items-center bg-zinc-900">
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
        animated
      />

      {/* top card */}
      <View className="flex w-full max-w-lg bg-white border-[2px] border-[#a3a3a3] px-4 pb-5 rounded-b-[3rem] shadow-lg pt-16 -mt-1">
        <View className="flex flex-row justify-between items-center px-3">
          <Text className="text-2xl font-sBlack">netSpeed</Text>
          <View className="flex flex-row items-center">
            <View
              className="flex flex-row items-center rounded-full px-3 py-1 mr-3 border"
              style={{
                backgroundColor: connected ? "#57C7850D" : "#f871710D",
                borderColor: connected ? "#57C78555" : "#f8717155",
              }}
            >
              <Ionicons
                name={networkType === "wifi" ? "wifi" : "cellular"}
                size={14}
                color={connected ? "#16a34a" : "#dc2626"}
              />
              <Text
                className="ml-1.5 text-xs font-sBold uppercase"
                style={{ color: connected ? "#16a34a" : "#dc2626" }}
              >
                {connected ? networkType || "online" : "offline"}
              </Text>
            </View>
            <Pressable onPress={() => setIsDrawerVisible(true)} hitSlop={10}>
              <AntDesign name="question-circle" size={22} color="black" />
            </Pressable>
          </View>
        </View>

        {/* stat tiles */}
        <View className="flex flex-row mt-5">
          <StatTile
            color={COLOR_PING}
            icon={
              <MaterialIcons name="network-ping" size={16} color={COLOR_PING} />
            }
            label="Ping"
            value={ping !== null ? `${ping}` : "—"}
            unit="ms"
            sub={jitter !== null ? `jitter ${jitter} ms` : undefined}
            fill={pingFill(ping)}
          />
          <StatTile
            color={COLOR_DOWN}
            icon={
              <MaterialCommunityIcons
                name="download-network"
                size={16}
                color={COLOR_DOWN}
              />
            }
            label="Download"
            value={downloadSpeed !== null ? `${downloadSpeed}` : "—"}
            unit="Mb/s"
            fill={speedFill(downloadSpeed)}
          />
          <StatTile
            color={COLOR_UP}
            icon={
              <MaterialCommunityIcons
                name="upload-network"
                size={16}
                color={COLOR_UP}
              />
            }
            label="Upload"
            value={uploadSpeed !== null ? `${uploadSpeed}` : "—"}
            unit="Mb/s"
            fill={speedFill(uploadSpeed)}
          />
        </View>
      </View>

      {/* dark panel with speedometer */}
      <View className="flex-1 items-center bg-[#0a1e27] border-[2px] border-[#254655] w-full max-w-lg rounded-t-[3rem] shadow-lg mt-5 -mb-1 pb-32">
        <Text className="mt-4 text-white text-m font-sBold">
          <Text className="text-[#57C785]">powered by </Text>builtelo
        </Text>

        <View className="flex-1 items-center justify-center">
          <View className="items-center">
            {isTesting && phase !== "ping" && (
              <View
                className="px-4 py-1 rounded-full mb-1"
                style={{ backgroundColor: `${gaugeColor}22` }}
              >
                <Text
                  className="text-[10px] font-sBold tracking-widest"
                  style={{ color: gaugeColor }}
                >
                  {phase === "download" ? "DOWNLOAD" : "UPLOAD"}
                </Text>
              </View>
            )}
            <Gauge speed={gaugeSpeed} color={gaugeColor} />
            <View className="items-center -mt-9">
              {phase === "ping" ? (
                <ActivityIndicator size="small" color={COLOR_PING} />
              ) : (
                <Text className="text-5xl text-white font-sBold">
                  {bigNumber}
                </Text>
              )}
              <Text className="text-xs text-gray-500 font-sMedium">Mb/s</Text>
            </View>

            <View className="flex flex-row items-center mt-2">
              <MaterialCommunityIcons
                name="upload-network"
                size={14}
                color={COLOR_UP}
              />
              <Text className="ml-1 text-xs text-gray-400 font-sMedium">
                {phase === "upload"
                  ? `${liveSpeed.toFixed(1)} Mb/s`
                  : mainUploadSpeed !== null
                    ? `${mainUploadSpeed} Mb/s`
                    : "—"}
              </Text>
            </View>

            {phaseLabel && (
              <Text className="mt-2 text-[11px] text-[#57C785] font-sMedium">
                {phaseLabel}
              </Text>
            )}
          </View>

          <View className="mt-3">
            <Text className="text-xs text-center text-gray-500 font-sMedium">
              IP:{" "}
              {isLocating && !ipAddress
                ? "Fetching..."
                : ipAddress ?? "Unavailable"}
            </Text>
            <Text className="text-xs text-center text-gray-500 font-sMedium">
              {isLocating && !location
                ? "Locating..."
                : location
                  ? `${location.city ?? ""}${location.city ? ", " : ""}${location.region ?? ""
                  }${location.region ? ", " : ""}${location.country ?? ""}${location.emoji ? ", " : ""
                  }${location.emoji ?? ""}`
                  : "Unavailable"}
            </Text>
            {location?.org && (
              <Text className="text-xs text-center text-gray-400 font-sMedium">
                {location.org}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* speed test button */}
      <View className="flex w-52 h-24 bg-[#0086FC] border-[5px] border-[#fff] absolute bottom-10 px-6 py-6 rounded-full shadow-3xl items-center justify-center">
        <Pressable onPress={runSpeedTest} disabled={isTesting || !connected}>
          {isTesting ? (
            <ActivityIndicator size="large" color="white" />
          ) : (
            <Text className="text-2xl text-center text-white font-sBold">
              {connected ? "Speed Test" : "Offline"}
            </Text>
          )}
        </Pressable>
      </View>

      {/* about drawer */}
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
          <Text className="mb-2 text-xl font-sBold text-zinc-800">
            About netSpeed
          </Text>
          <Text className="mb-5 text-base text-center font-sRegular text-zinc-700">
            Tap "Speed Test" for a full measurement: ping and jitter first,
            then download and upload measured live for{" "}
            {TEST_DURATION_MS / 1000} seconds each against Cloudflare's
            speed-test servers. Your IP and location come from public APIs.
          </Text>
          <Pressable
            className="bg-[#0086FC] rounded-xl py-2 px-8"
            onPress={() => setIsDrawerVisible(false)}
          >
            <Text className="text-lg text-white font-sBold">Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
};

export default NetworkMonitor;
