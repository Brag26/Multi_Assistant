import { Plus_Jakarta_Sans } from "next/font/google";

// Self-hosted via next/font: downloaded and served from our own domain at
// build time, so there's no render-blocking request to fonts.googleapis.com
// and no flash of unstyled/fallback text — this is both a design fix (a
// distinctive, premium grotesque instead of the system-ui fallback the app
// was silently rendering) and a load-time fix (one less external round trip
// on every page).
export const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});
