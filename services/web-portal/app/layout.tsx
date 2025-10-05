import type { Metadata } from 'next'

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
      <body style={{ margin: 0, padding: 0, fontFamily: 'Arial, sans-serif' }}>{children}</body>
    </html>
  )
}