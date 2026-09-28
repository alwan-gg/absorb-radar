import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Absorb & Flow Radar | 24/7 Altcoin Orderflow Engine',
  description: 'Multi-Timeframe Absorption, CVD Delta, and Open Interest Scanner for Binance Perpetuals.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090d16] text-slate-100 min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
