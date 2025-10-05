/**
 * Test LLM Integration
 * Simple endpoint to verify OpenAI is working
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';

export async function registerTestLLMRoutes(app: FastifyInstance) {
  /**
   * GET /api/test-llm
   * Test OpenAI API integration
   */
  app.get('/api/test-llm', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        reply.code(500).send({
          success: false,
          error: 'OPENAI_API_KEY not configured',
        });
        return;
      }

      logger.info('Testing OpenAI API...');

      const openai = new OpenAI({ apiKey });

      const startTime = Date.now();
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful code analysis assistant.',
          },
          {
            role: 'user',
            content: 'In one sentence, what is React.js?',
          },
        ],
        max_tokens: 100,
        temperature: 0.7,
      });

      const duration = Date.now() - startTime;
      const answer = response.choices[0]?.message?.content || 'No response';

      logger.info('OpenAI API call successful', {
        duration,
        tokens: response.usage,
      });

      reply.send({
        success: true,
        data: {
          model: response.model,
          answer,
          duration_ms: duration,
          tokens_used: response.usage,
          cost_usd: ((response.usage?.total_tokens || 0) * 0.002 / 1000).toFixed(4),
        },
      });
    } catch (error) {
      logger.error('OpenAI API test failed:', error);
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to call OpenAI API',
        details: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  logger.info('Test LLM routes registered');
}

