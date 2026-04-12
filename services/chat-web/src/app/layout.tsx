import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Guardian Pattern vs. Bedrock Guardrails — Vergleich',
  description: 'Side-by-side Vergleich: eigener Guardian Pattern vs. AWS Bedrock Guardrails',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
