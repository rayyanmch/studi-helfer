import type { ReactNode } from "react";
import { metadataFor, Shell } from "../shell";

export const metadata = metadataFor("de");
export { viewport } from "../shell";

export default function GermanLayout({ children }: { children: ReactNode }) {
  return <Shell lang="de">{children}</Shell>;
}
