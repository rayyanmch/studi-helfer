import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studi-Helfer",
  description: "Deine Uni-Unterlagen an einem Ort",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
