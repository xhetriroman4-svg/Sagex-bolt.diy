import { atom } from 'nanostores';

export const streamingState = atom<boolean>(false);

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export const tokenUsage = atom<TokenUsage>({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
});

export const streamingStartTime = atom<number>(0);
