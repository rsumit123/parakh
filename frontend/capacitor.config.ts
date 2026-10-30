import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.skdev.parakh",
  appName: "Parakh",
  webDir: "dist",
  server: {
    // For on-device dev against the Vite server, set your machine's LAN IP:
    // url: "http://192.168.x.x:5173",
    // cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_parakh",   // android/app/src/main/res/drawable
      iconColor: "#1fa463",
    },
  },
};

export default config;
