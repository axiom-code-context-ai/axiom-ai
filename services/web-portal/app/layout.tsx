import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Axiom AI - Codebase Intelligence Platform',
  description: 'Intelligent codebase analysis and context injection platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}