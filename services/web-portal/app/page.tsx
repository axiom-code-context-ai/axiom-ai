export default function Home() {
  return (
    <div className="container">
      <div className="header">
        <h1 className="title">Axiom AI - Codebase Intelligence Platform</h1>
        <p className="subtitle">
          Your intelligent codebase analysis and context injection platform
        </p>
      </div>

      <div className="grid">
        <div className="card">
          <h3>🔍 Intelligent Search</h3>
          <p>Vector similarity search with semantic code discovery</p>
        </div>
        
        <div className="card">
          <h3>🧠 Code Analysis</h3>
          <p>Explain complex patterns and generate context</p>
        </div>
        
        <div className="card">
          <h3>⚡ Smart Refactoring</h3>
          <p>Suggest improvements and identify code smells</p>
        </div>
        
        <div className="card">
          <h3>📊 Codebase Intelligence</h3>
          <p>Repository analysis and dependency mapping</p>
        </div>
      </div>

      <div className="status">
        <h3>System Status</h3>
        <div className="status-item">Search API: <span className="status-ok">✓ Operational</span></div>
        <div className="status-item">Database: <span className="status-ok">✓ Connected</span></div>
        <div className="status-item">MCP Server: <span className="status-ok">✓ Ready</span></div>
        <div className="status-item">Crawler Agent: <span className="status-ok">✓ Running</span></div>
      </div>
    </div>
  )
}