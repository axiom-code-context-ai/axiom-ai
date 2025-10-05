/**
 * Demo LLM Analysis
 * Direct LLM analysis of React repository to demonstrate capabilities
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';
import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function registerDemoLLMRoutes(app: FastifyInstance) {
  /**
   * POST /api/demo-llm-analysis
   * Demonstrate LLM analysis on React codebase
   */
  app.post('/api/demo-llm-analysis', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        reply.code(500).send({
          success: false,
          error: 'OPENAI_API_KEY not configured',
        });
        return;
      }

      logger.info('🔥 Starting LLM-powered analysis demo...');

      const openai = new OpenAI({ apiKey });

      // Step 1: Analyze Architecture Patterns
      logger.info('Step 1: Analyzing React architecture patterns...');
      const archAnalysisStart = Date.now();
      
      const archResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert code architect analyzing the React.js library codebase.',
          },
          {
            role: 'user',
            content: `Based on your knowledge of React.js repository (facebook/react), identify and explain the 3 most important architectural patterns used. For each pattern, provide:
1. Pattern name
2. Purpose/why it exists
3. Where it's implemented (which package/component)
4. Key benefit

Format as JSON array with fields: name, purpose, location, benefit`,
          },
        ],
        max_tokens: 800,
        temperature: 0.7,
      });

      const archDuration = Date.now() - archAnalysisStart;
      const architectureAnalysis = archResponse.choices[0]?.message?.content || '';

      // Step 2: Analyze Domain Models
      logger.info('Step 2: Analyzing React domain models...');
      const domainAnalysisStart = Date.now();
      
      const domainResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in React.js internal architecture.',
          },
          {
            role: 'user',
            content: `For React.js, identify the 4 core domain entities/models and their relationships:
1. Entity name (e.g., Fiber, Component, Hook)
2. What it represents
3. Key properties
4. Relationships to other entities

Format as JSON array with fields: entity, description, properties (array), relationships (array)`,
          },
        ],
        max_tokens: 800,
        temperature: 0.7,
      });

      const domainDuration = Date.now() - domainAnalysisStart;
      const domainAnalysis = domainResponse.choices[0]?.message?.content || '';

      // Step 3: Generate Code Pattern Template
      logger.info('Step 3: Generating React custom hook pattern template...');
      const patternAnalysisStart = Date.now();
      
      const patternResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a React expert who teaches best practices.',
          },
          {
            role: 'user',
            content: `Generate a reusable code template for a React custom hook following React team's conventions.
Include:
1. Template code with placeholders
2. When to use this pattern
3. Best practices
4. Common pitfalls to avoid

Format as JSON with fields: template (code string), whenToUse, bestPractices (array), pitfalls (array)`,
          },
        ],
        max_tokens: 600,
        temperature: 0.7,
      });

      const patternDuration = Date.now() - patternAnalysisStart;
      const patternTemplate = patternResponse.choices[0]?.message?.content || '';

      const totalDuration = Date.now() - startTime;
      const totalTokens = 
        (archResponse.usage?.total_tokens || 0) +
        (domainResponse.usage?.total_tokens || 0) +
        (patternResponse.usage?.total_tokens || 0);

      const estimatedCost = (totalTokens * 0.002 / 1000);

      logger.info('✅ LLM analysis complete!', {
        duration: totalDuration,
        tokens: totalTokens,
        cost: estimatedCost,
      });

      reply.send({
        success: true,
        data: {
          repository: 'https://github.com/facebook/react',
          timestamp: new Date().toISOString(),
          analysis: {
            architecturePatterns: {
              content: architectureAnalysis,
              duration_ms: archDuration,
              tokens_used: archResponse.usage?.total_tokens || 0,
              cost_usd: ((archResponse.usage?.total_tokens || 0) * 0.002 / 1000).toFixed(4),
            },
            domainModels: {
              content: domainAnalysis,
              duration_ms: domainDuration,
              tokens_used: domainResponse.usage?.total_tokens || 0,
              cost_usd: ((domainResponse.usage?.total_tokens || 0) * 0.002 / 1000).toFixed(4),
            },
            codePatternTemplate: {
              content: patternTemplate,
              duration_ms: patternDuration,
              tokens_used: patternResponse.usage?.total_tokens || 0,
              cost_usd: ((patternResponse.usage?.total_tokens || 0) * 0.002 / 1000).toFixed(4),
            },
          },
          summary: {
            total_duration_ms: totalDuration,
            total_tokens: totalTokens,
            total_cost_usd: estimatedCost.toFixed(4),
            llm_model: 'gpt-3.5-turbo',
            analyses_completed: 3,
          },
        },
      });
    } catch (error) {
      logger.error('LLM analysis demo failed:', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run LLM analysis',
        details: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  logger.info('Demo LLM analysis routes registered');
}

