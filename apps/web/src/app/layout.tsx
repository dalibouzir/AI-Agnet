import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from './(theme)/ThemeProvider';
import PageTransition from '@/components/PageTransition';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' });
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Business Agent',
  description: 'Neural operations platform for governed, cited business agents.',
};

export const viewport = {
  themeColor: '#0B0F17',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${plusJakarta.variable} min-h-screen bg-[color:var(--bg)] text-[color:var(--text)] antialiased`}>
        <ThemeProvider>
          <PageTransition>
            <main>{children}</main>
          </PageTransition>
        </ThemeProvider>
      </body>
    </html>
  );
}
