import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { 
  ArrowRight, 
  Brain, 
  Code2, 
  Search, 
  Shield, 
  Zap,
  Github,
  GitBranch,
  Database,
  Bot
} from 'lucide-react'

export default async function HomePage() {
  const session = await getServerSession(authOptions)

  // If user is authenticated, redirect to dashboard
  if (session) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Navigation */}
      <nav className="border-b bg-white/50 backdrop-blur-sm dark:bg-slate-900/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Brain className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">Axiom AI</span>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Codebase Intelligence
            </span>
            <br />
            <span className="text-slate-900 dark:text-slate-100">
              Powered by AI
            </span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto">
            Transform your development workflow with AI-powered code analysis, intelligent search, 
            and seamless IDE integration through Model Context Protocol (MCP).
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-lg px-8" asChild>
              <Link href="/auth/register">
                Start Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8" asChild>
              <Link href="https://github.com/axiom-ai/axiom-ai" target="_blank">
                <Github className="mr-2 h-5 w-5" />
                View on GitHub
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Everything you need for intelligent code analysis</h2>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            From repository processing to AI-powered insights, Axiom AI provides a complete platform 
            for understanding and working with your codebase.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="p-6 rounded-lg border bg-white/50 backdrop-blur-sm dark:bg-slate-800/50">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">AI-Powered Search</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Find code patterns, functions, and implementations using natural language queries 
              with vector similarity search.
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-white/50 backdrop-blur-sm dark:bg-slate-800/50">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
              <Bot className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">MCP Integration</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Seamlessly integrate with Cursor, VS Code, and other IDEs through 
              Model Context Protocol for enhanced AI assistance.
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-white/50 backdrop-blur-sm dark:bg-slate-800/50">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
              <GitBranch className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Repository Processing</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Automatically analyze and index your Git repositories with incremental sync 
              and pattern extraction capabilities.
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-white/50 backdrop-blur-sm dark:bg-slate-800/50">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Security Scanning</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Built-in security analysis with OWASP Top 10, CVE detection, 
              and compliance checking for enterprise-grade security.
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-white/50 backdrop-blur-sm dark:bg-slate-800/50">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center mb-4">
              <Database className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Vector Database</h3>
            <p className="text-slate-600 dark:text-slate-400">
              High-performance PostgreSQL with pgvector for storing and querying 
              code embeddings at scale.
            </p>
          </div>

          <div className="p-6 rounded-lg border bg-white/50 backdrop-blur-sm dark:bg-slate-800/50">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Real-time Sync</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Keep your codebase analysis up-to-date with automatic incremental 
              synchronization and change detection.
            </p>
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Built for Scale & Performance</h2>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Microservices architecture designed for enterprise workloads with 
            Docker containerization and horizontal scaling.
          </p>
        </div>

        <div className="bg-white/50 backdrop-blur-sm dark:bg-slate-800/50 rounded-lg p-8 border">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <Code2 className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Web Portal</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Next.js dashboard for workspace management, repository configuration, 
                and analytics visualization.
              </p>
            </div>
            <div className="text-center">
              <Brain className="h-12 w-12 text-purple-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">MCP Server</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Model Context Protocol server providing AI context injection 
                and intelligent code assistance.
              </p>
            </div>
            <div className="text-center">
              <Search className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Search Engine</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                High-performance vector and keyword search with hybrid ranking 
                and caching strategies.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold mb-4">Ready to revolutionize your development workflow?</h2>
          <p className="text-xl text-slate-600 dark:text-slate-400 mb-8">
            Join thousands of developers who are already using Axiom AI to understand 
            and work with their codebases more effectively.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-lg px-8" asChild>
              <Link href="/auth/register">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8" asChild>
              <Link href="/docs">
                View Documentation
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white/50 backdrop-blur-sm dark:bg-slate-900/50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <Brain className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold">Axiom AI</span>
            </div>
            <div className="flex items-center space-x-6 text-sm text-slate-600 dark:text-slate-400">
              <Link href="/docs" className="hover:text-slate-900 dark:hover:text-slate-100">
                Documentation
              </Link>
              <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-slate-100">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-slate-900 dark:hover:text-slate-100">
                Terms
              </Link>
              <Link href="https://github.com/axiom-ai/axiom-ai" className="hover:text-slate-900 dark:hover:text-slate-100">
                GitHub
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
