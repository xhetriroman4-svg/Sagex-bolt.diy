import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

/**
 * Gemini Provider - Uses Google AI Studio API
 * Works with API keys from https://aistudio.google.com/app/apikey
 * Uses OpenAI-compatible endpoint for better reliability
 */
export default class GeminiProvider extends BaseProvider {
  name = 'Gemini';
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';
  labelForGetApiKey = 'Get Gemini API Key';

  config = {
    apiTokenKey: 'GEMINI_API_KEY',
    baseUrlKey: 'GEMINI_API_BASE_URL',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  };

  staticModels: ModelInfo[] = [
    /*
     * Gemini 2.0 Flash - Latest model with 1M context, fast and capable
     */
    {
      name: 'gemini-2.0-flash',
      label: 'Gemini 2.0 Flash',
      provider: 'Gemini',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 8192,
    },

    /*
     * Gemini 2.0 Flash Lite - Lighter version for faster responses
     */
    {
      name: 'gemini-2.0-flash-lite',
      label: 'Gemini 2.0 Flash Lite',
      provider: 'Gemini',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 8192,
    },

    /*
     * Gemini 1.5 Pro - 2M context, 8K output limit
     */
    {
      name: 'gemini-1.5-pro',
      label: 'Gemini 1.5 Pro',
      provider: 'Gemini',
      maxTokenAllowed: 2000000,
      maxCompletionTokens: 8192,
    },

    /*
     * Gemini 1.5 Flash - 1M context, fast and cost-effective
     */
    {
      name: 'gemini-1.5-flash',
      label: 'Gemini 1.5 Flash',
      provider: 'Gemini',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 8192,
    },

    /*
     * Gemini 1.5 Flash 8B - Smaller, faster model
     */
    {
      name: 'gemini-1.5-flash-8b',
      label: 'Gemini 1.5 Flash 8B',
      provider: 'Gemini',
      maxTokenAllowed: 1000000,
      maxCompletionTokens: 8192,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'GEMINI_API_BASE_URL',
      defaultApiTokenKey: 'GEMINI_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    // Use the Gemini API to list models
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models from Gemini API: ${response.status} ${response.statusText}`);
    }

    const res = (await response.json()) as any;

    if (!res.models || !Array.isArray(res.models)) {
      throw new Error('Invalid response format from Gemini API');
    }

    // Filter for Gemini models with good token limits
    const data = res.models.filter((model: any) => {
      const modelName = model.name?.replace('models/', '') || '';
      const isGemini = modelName.includes('gemini');
      const hasGoodTokenLimit = (model.outputTokenLimit || 0) >= 8000;

      return isGemini && hasGoodTokenLimit;
    });

    const staticModelIds = this.staticModels.map((m) => m.name);

    return data
      .filter((m: any) => {
        const modelName = m.name.replace('models/', '');
        return !staticModelIds.includes(modelName);
      })
      .map((m: any) => {
        const modelName = m.name.replace('models/', '');

        // Get context window from API
        let contextWindow = 1000000; // default to 1M

        if (m.inputTokenLimit) {
          contextWindow = m.inputTokenLimit;
        } else if (modelName.includes('gemini-1.5-pro')) {
          contextWindow = 2000000;
        } else if (modelName.includes('gemini-2.0') || modelName.includes('gemini-1.5-flash')) {
          contextWindow = 1000000;
        }

        // Get completion token limit
        let completionTokens = 8192;

        if (m.outputTokenLimit && m.outputTokenLimit > 0) {
          completionTokens = Math.min(m.outputTokenLimit, 65536);
        }

        const displayName = m.displayName || modelName;

        return {
          name: modelName,
          label: `${displayName} (${contextWindow >= 1000000 ? Math.floor(contextWindow / 1000000) + 'M' : Math.floor(contextWindow / 1000) + 'k'} context)`,
          provider: this.name,
          maxTokenAllowed: contextWindow,
          maxCompletionTokens: completionTokens,
        };
      });
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey, baseUrl } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'GEMINI_API_BASE_URL',
      defaultApiTokenKey: 'GEMINI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(
        `Missing API key for ${this.name} provider. Get your API key from https://aistudio.google.com/app/apikey`,
      );
    }

    // Use OpenAI-compatible endpoint for Gemini
    const geminiBaseUrl = baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai';

    const openai = createOpenAI({
      baseURL: geminiBaseUrl,
      apiKey,
    });

    return openai(model);
  }
}
