import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios'
import { createModuleLogger } from '../utils/logger.js'
import { env } from '../config/env.js'

const logger = createModuleLogger('security-service')

export interface SecurityScanRequest {
  workspaceId: string
  repositoryId?: string
  scanTypes: ('owasp' | 'cve' | 'dependency' | 'compliance')[]
  options?: {
    severity?: 'low' | 'medium' | 'high' | 'critical'
    includeFixed?: boolean
    maxResults?: number
  }
}

export interface SecurityVulnerability {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  file: string
  line?: number
  column?: number
  cwe?: string
  cve?: string
  recommendation: string
  references: string[]
  fixable: boolean
  confidence: number
}

export interface SecurityScanResult {
  scanId: string
  workspaceId: string
  repositoryId?: string
  scanTypes: string[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  vulnerabilities: SecurityVulnerability[]
  metadata: Record<string, any>
}

export interface ComplianceCheck {
  framework: string
  requirement: string
  status: 'compliant' | 'non-compliant' | 'partial'
  description: string
  evidence?: string[]
  remediation?: string
}

export class SecurityService {
  private apiClient: AxiosInstance

  constructor() {
    this.apiClient = axios.create({
      baseURL: env.SECURITY_API_URL,
      timeout: env.REQUEST_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `${env.MCP_SERVER_NAME}/${env.MCP_SERVER_VERSION}`,
      },
    })

    // Add request/response interceptors
    this.apiClient.interceptors.request.use(
      (config) => {
        logger.debug('Making security API request', {
          method: config.method,
          url: config.url,
        })
        return config
      },
      (error: AxiosError) => {
        logger.error('Security API request error:', error)
        return Promise.reject(error)
      }
    )

    this.apiClient.interceptors.response.use(
      (response: AxiosResponse) => {
        logger.debug('Security API response received', {
          status: response.status,
          url: response.config.url,
        })
        return response
      },
      (error: AxiosError) => {
        logger.error('Security API response error:', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
        })
        return Promise.reject(error)
      }
    )
  }

  /**
   * Start a security scan
   */
  async startScan(request: SecurityScanRequest): Promise<{
    scanId: string
    status: string
    estimatedDuration: number
  }> {
    try {
      const response = await this.apiClient.post<{
        scanId: string
        status: string
        estimatedDuration: number
      }>('/api/scans', request)

      logger.info('Security scan started', {
        scanId: response.data.scanId,
        workspaceId: request.workspaceId,
        scanTypes: request.scanTypes,
      })

      return response.data
    } catch (error) {
      logger.error('Failed to start security scan:', error)
      
      if (axios.isAxiosError(error)) {
        if (error.response && error.response.status === 400) {
          throw new Error(`Invalid scan request: ${error.response.data?.message || 'Bad request'}`)
        }
        if (error.response && error.response.status === 404) {
          throw new Error('Workspace or repository not found')
        }
        if (error.response && error.response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.')
        }
        if (error.response && error.response.status !== undefined && error.response.status >= 500) {
          throw new Error('Security service is temporarily unavailable')
        }
      }
      
      throw new Error('Failed to start security scan')
    }
  }

  /**
   * Get scan results
   */
  async getScanResults(scanId: string): Promise<SecurityScanResult> {
    try {
      const response = await this.apiClient.get<SecurityScanResult>(`/api/scans/${scanId}`)
      return response.data
    } catch (error) {
      logger.error('Failed to get scan results:', error)
      
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error('Security scan not found')
      }
      
      throw new Error('Failed to retrieve security scan results')
    }
  }

  /**
   * Get scan status
   */
  async getScanStatus(scanId: string): Promise<{
    status: string
    progress: number
    currentStep: string
    estimatedTimeRemaining: number
  }> {
    try {
      const response = await this.apiClient.get(`/api/scans/${scanId}/status`)
      return response.data
    } catch (error) {
      logger.error('Failed to get scan status:', error)
      throw new Error('Failed to retrieve scan status')
    }
  }

  /**
   * Cancel a running scan
   */
  async cancelScan(scanId: string): Promise<void> {
    try {
      await this.apiClient.delete(`/api/scans/${scanId}`)
      logger.info('Security scan cancelled', { scanId })
    } catch (error) {
      logger.error('Failed to cancel scan:', error)
      throw new Error('Failed to cancel security scan')
    }
  }

  /**
   * Get vulnerability details
   */
  async getVulnerabilityDetails(vulnerabilityId: string): Promise<{
    vulnerability: SecurityVulnerability
    relatedVulnerabilities: SecurityVulnerability[]
    fixExamples: Array<{
      title: string
      description: string
      before: string
      after: string
      language: string
    }>
  }> {
    try {
      const response = await this.apiClient.get(`/api/vulnerabilities/${vulnerabilityId}`)
      return response.data
    } catch (error) {
      logger.error('Failed to get vulnerability details:', error)
      throw new Error('Failed to retrieve vulnerability details')
    }
  }

  /**
   * Check compliance against frameworks
   */
  async checkCompliance(
    workspaceId: string,
    frameworks: string[] = ['owasp-top-10', 'soc2', 'gdpr']
  ): Promise<{
    framework: string
    overallScore: number
    checks: ComplianceCheck[]
  }[]> {
    try {
      const response = await this.apiClient.post('/api/compliance/check', {
        workspaceId,
        frameworks,
      })
      return response.data
    } catch (error) {
      logger.error('Failed to check compliance:', error)
      throw new Error('Failed to perform compliance check')
    }
  }

  /**
   * Get security recommendations
   */
  async getRecommendations(
    workspaceId: string,
    options: {
      priority?: 'high' | 'medium' | 'low'
      category?: 'authentication' | 'authorization' | 'data-protection' | 'infrastructure'
      limit?: number
    } = {}
  ): Promise<Array<{
    id: string
    title: string
    description: string
    category: string
    priority: string
    effort: 'low' | 'medium' | 'high'
    impact: 'low' | 'medium' | 'high'
    implementation: {
      steps: string[]
      codeExamples?: Array<{
        language: string
        code: string
        description: string
      }>
    }
    references: string[]
  }>> {
    try {
      const response = await this.apiClient.get(`/api/workspaces/${workspaceId}/recommendations`, {
        params: options,
      })
      return response.data
    } catch (error) {
      logger.error('Failed to get security recommendations:', error)
      throw new Error('Failed to retrieve security recommendations')
    }
  }

  /**
   * Analyze code for security issues
   */
  async analyzeCode(
    code: string,
    language: string,
    options: {
      rules?: string[]
      severity?: string
      context?: string
    } = {}
  ): Promise<{
    issues: Array<{
      type: string
      severity: string
      message: string
      line?: number
      column?: number
      rule: string
      suggestion: string
    }>
    summary: {
      total: number
      critical: number
      high: number
      medium: number
      low: number
    }
  }> {
    try {
      const response = await this.apiClient.post('/api/analyze/code', {
        code,
        language,
        ...options,
      })
      return response.data
    } catch (error) {
      logger.error('Failed to analyze code:', error)
      throw new Error('Failed to perform code security analysis')
    }
  }

  /**
   * Get security metrics for workspace
   */
  async getSecurityMetrics(
    workspaceId: string,
    timeRange: '24h' | '7d' | '30d' = '7d'
  ): Promise<{
    vulnerabilityTrend: Array<{
      date: string
      critical: number
      high: number
      medium: number
      low: number
    }>
    topVulnerabilityTypes: Array<{
      type: string
      count: number
      trend: 'up' | 'down' | 'stable'
    }>
    complianceScore: {
      current: number
      previous: number
      trend: 'up' | 'down' | 'stable'
    }
    riskScore: {
      current: number
      previous: number
      factors: string[]
    }
  }> {
    try {
      const response = await this.apiClient.get(`/api/workspaces/${workspaceId}/metrics`, {
        params: { timeRange },
      })
      return response.data
    } catch (error) {
      logger.error('Failed to get security metrics:', error)
      throw new Error('Failed to retrieve security metrics')
    }
  }

  /**
   * List recent scans for workspace
   */
  async listScans(
    workspaceId: string,
    options: {
      limit?: number
      status?: string
      scanType?: string
    } = {}
  ): Promise<Array<{
    scanId: string
    scanTypes: string[]
    status: string
    startedAt: string
    completedAt?: string
    summary: {
      total: number
      critical: number
      high: number
      medium: number
      low: number
    }
  }>> {
    try {
      const response = await this.apiClient.get(`/api/workspaces/${workspaceId}/scans`, {
        params: options,
      })
      return response.data
    } catch (error) {
      logger.error('Failed to list scans:', error)
      throw new Error('Failed to retrieve security scans')
    }
  }

  /**
   * Health check for security service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.apiClient.get('/health')
      return response.status === 200
    } catch (error) {
      logger.error('Security service health check failed:', error)
      return false
    }
  }
}
