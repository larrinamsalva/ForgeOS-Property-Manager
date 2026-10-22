import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
export const metadata: Metadata = {
  title: 'ForgeOS · Property Manager',
  description: 'One system. Every site. Total control. Independent RV park and property operations.',
};
const themeScript =
  "try{document.documentElement.dataset.theme=localStorage.getItem('forgeos-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}";
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
