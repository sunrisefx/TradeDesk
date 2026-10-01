import type { Metadata } from "next";
import { UnlockView } from "@/components/settings/UnlockView";

export const metadata: Metadata = { title: "Unlock" };

export default function UnlockPage() {
  return <UnlockView />;
}
