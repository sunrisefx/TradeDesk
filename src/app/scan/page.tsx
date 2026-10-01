import type { Metadata } from "next";
import { ScanHub } from "@/components/scanner/ScanHub";

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage() {
  return <ScanHub />;
}
