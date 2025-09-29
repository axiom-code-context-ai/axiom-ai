import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Axiom AI - Codebase Intelligence Platform',
    template: '%s | Axiom AI'
  },
  description: 'Complete codebase intelligence platform with AI-powered search, analysis, and MCP integration',
  keywords: [
    'AI',
    'codebase intelligence',
    'code search',
    'MCP',
    'model context protocol',
    'vector search',
    'code analysis',
    'repository management'
  ],
  authors: [
    {
      name: 'Axiom AI Team',
      url: 'https://axiom.ai'
    }
  ],
  creator: 'Axiom AI',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://axiom.ai',
    title: 'Axiom AI - Codebase Intelligence Platform',
    description: 'Complete codebase intelligence platform with AI-powered search, analysis, and MCP integration',
    siteName: 'Axiom AI',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Axiom AI - Codebase Intelligence Platform'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Axiom AI - Codebase Intelligence Platform',
    description: 'Complete codebase intelligence platform with AI-powered search, analysis, and MCP integration',
    images: ['/og-image.png'],
    creator: '@axiom_ai'
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
