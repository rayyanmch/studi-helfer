import type { ReactNode } from "react";
import { metadataFor, Shell } from "../shell";

export const metadata = metadataFor("en");
export { viewport } from "../shell";

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return <Shell lang="en">{children}</Shell>;
}
