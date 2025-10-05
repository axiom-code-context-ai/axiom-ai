'use client'

import { useState } from 'react'

export default function Home() {
  const [gitUrl, setGitUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState(null)

  const handleAnalyze = async () => {
    if (!gitUrl) return
    
    setIsAnalyzing(true)
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gitUrl })
      })
      const data = await response.json()
      setResult(data)
    } catch (error) {
      console.error('Analysis failed:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '40px' }}>
        Axiom AI - Codebase Context Generator
      </h1>
      
      <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2 style={{ marginTop: 0, color: '#555' }}>Analyze Repository</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          Enter a Git URL to analyze the codebase and generate intelligent context for development.
        </p>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input
            type="text"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            style={{ 
              flex: 1, 
              padding: '10px', 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              fontSize: '16px'
            }}
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !gitUrl}
            style={{
              padding: '10px 20px',
              backgroundColor: isAnalyzing ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ background: '#e8f5e8', padding: '20px', borderRadius: '8px' }}>
          <h3 style={{ marginTop: 0, color: '#2d5a2d' }}>Analysis Complete</h3>
          <p><strong>Repository:</strong> {result.repository}</p>
          <p><strong>Files Analyzed:</strong> {result.filesAnalyzed}</p>
          <p><strong>Context Generated:</strong> {result.contextGenerated ? 'Yes' : 'No'}</p>
          <p><strong>Status:</strong> Ready for MCP integration</p>
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '20px', background: '#f0f8ff', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0, color: '#0066cc' }}>How It Works</h3>
        <ol style={{ color: '#555', lineHeight: '1.6' }}>
          <li><strong>Analyze:</strong> Enter Git URL to analyze codebase structure</li>
          <li><strong>Generate Context:</strong> TreeSitter AST analysis creates intelligent context</li>
          <li><strong>Store:</strong> Context stored in database for MCP server access</li>
          <li><strong>Integrate:</strong> MCP server supplies context to coding agents (Cursor/Cline)</li>
        </ol>
      </div>
    </div>
  )
}