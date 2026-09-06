import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.brenjithazarika.twogether",
  appName: "Twogether",
  webDir: "android-shell",
  loggingBehavior: "debug",
  backgroundColor: "#f3f6f4",
  server: {
    url: "https://twogether-brenjit-kaveri.brenjithazarika.workers.dev",
    cleartext: false,
  },
  android: {
    appendUserAgent: " TwogetherAndroid/1.0",
    backgroundColor: "#f3f6f4",
    webContentsDebuggingEnabled: false,
  },
};

export default config;
