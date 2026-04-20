import type { Metadata } from "next";
import MaintenanceOverlay from "@/components/MaintenanceOverlay";
import "./globals.css";

export const metadata: Metadata = {
  title: "Houston — AI-Powered Triage Simulator",
  description: "Intelligent triage simulator for client-developer communication",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <MaintenanceOverlay />
      </body>
    </html>
  );
}
