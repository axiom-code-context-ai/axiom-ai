import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { gitUrl } = await request.json()
    
    if (!gitUrl) {
      return NextResponse.json({ error: 'Git URL is required' }, { status: 400 })
    }

    // Call the crawler-agent service for REAL analysis
    const crawlerUrl = process.env.CRAWLER_AGENT_URL || 'http://crawler-agent:4001'
    
    console.log('Triggering real repository analysis:', gitUrl)
    
    const response = await fetch(`${crawlerUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gitUrl })
    })

    if (!response.ok) {
      throw new Error(`Crawler agent failed: ${response.statusText}`)
    }

    const result = await response.json()
    
    return NextResponse.json({
      repository: gitUrl,
      filesAnalyzed: result.filesProcessed || 0,
      contextGenerated: result.contextGenerated || false,
      patterns: result.patterns || [],
      analysisTime: result.timestamp,
      status: result.status
    })
    
  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json({ 
      error: 'Analysis failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}