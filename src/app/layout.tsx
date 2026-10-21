import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ForgeOS · Property Manager',
  description: 'One system. Every site. Total control. Independent RV park and property operations.',
};
const themeScript =
  "try{document.documentElement.dataset.theme=localStorage.getItem('forgeos-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
