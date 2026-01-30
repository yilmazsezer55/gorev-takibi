
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/components/theme-provider';
import Image from 'next/image';
import { Youtube, Linkedin } from 'lucide-react';
import pkg from '../../package.json';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  title: 'Görev Yönetici',
  description: 'Yılmaz Sezer tarafından Firebase Studio ile geliştirilmiştir.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [major, minor, patch] = pkg.version.split('.');

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
      </head>
      <body className="font-body antialiased bg-background text-foreground flex flex-col min-h-screen">
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
                <div className="flex-grow">
                {children}
                </div>
                <footer className="w-full bg-background text-xs text-muted-foreground py-2 border-t print:hidden flex justify-between items-center px-4">
                    <div>
                        <span>© Copyright 2025</span>
                        <span className="ml-4">
                            v
                            <Tooltip>
                                <TooltipTrigger asChild><span className="cursor-pointer">{major}</span></TooltipTrigger>
                                <TooltipContent><p>Ana Sürüm (Major)</p></TooltipContent>
                            </Tooltip>
                            .
                            <Tooltip>
                                <TooltipTrigger asChild><span className="cursor-pointer">{minor}</span></TooltipTrigger>
                                <TooltipContent><p>Alt Sürüm (Minor)</p></TooltipContent>
                            </Tooltip>
                            .
                            <Tooltip>
                                <TooltipTrigger asChild><span className="cursor-pointer">{patch}</span></TooltipTrigger>
                                <TooltipContent><p>Düzeltme/Yapı Numarası (Patch/Build)</p></TooltipContent>
                            </Tooltip>
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <a href="https://firebase.google.com/" target="_blank" rel="noopener noreferrer" aria-label="Firebase Studio">
                            <Image src="https://www.gstatic.com/monospace/250314/icon-192.png" alt="Firebase Studio Logo" width={24} height={24} />
                        </a>
                        <div className="flex items-center gap-2">
                            <a href="https://www.linkedin.com/in/y%C4%B1lmazsezer/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors font-medium" aria-label="Yılmaz Sezer LinkedIn Profili">
                            Yılmaz Sezer
                            </a>
                            <a href="https://www.youtube.com/@YilmazSezer" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" aria-label="Yılmaz Sezer YouTube Kanalı">
                                <Youtube className="h-5 w-5" />
                            </a>
                        </div>
                    </div>
                </footer>
                <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
