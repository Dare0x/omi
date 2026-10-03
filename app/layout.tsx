import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import SiteNav from "@/components/SiteNav";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: ["400"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "OMI — flood money that arrives before the water does",
  description:
    "A flood fund on Arc that pays registered households in USDC when the river says so: part on the forecast, the rest when the river stays over its flood level. Rules fixed before the season, data anyone can check.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body>
        <header className="site-head">
          <div className="site-head-inner">
            <Link href="/" className="wordmark">
              omi
            </Link>
            <SiteNav />
          </div>
        </header>
        <div className="frame">
          {children}
          <footer className="site-foot">
            <p>
              River data: GloFAS river discharge, Copernicus Emergency Management Service (CC BY 4.0), served by Open-Meteo. Every level, status
              and payout rule here is computed by code you can read and re-run; no AI model produces or changes a number.
            </p>
            <p>OMI is a prototype of a donor-funded early-cash fund, not an insurance product. Omi means water in Yoruba.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
