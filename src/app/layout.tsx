import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Multi-App AI Agent",
  description: "Cross-app personal work assistant connecting Gmail, Calendar, Slack, Trello, and Telegram",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", margin: 0, padding: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
