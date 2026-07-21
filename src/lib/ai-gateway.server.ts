import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function createGeminiProvider(apiKey: string) {
  const provider = createGoogleGenerativeAI({
    apiKey,
  });

  return (modelId: string) => provider.languageModel(modelId);
}