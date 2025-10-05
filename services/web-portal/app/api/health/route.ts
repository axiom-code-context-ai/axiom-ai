import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'Axiom AI Web Portal',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  })
}
