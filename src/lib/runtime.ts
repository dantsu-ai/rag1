import { CONFIG } from './config';

// Runtime-mutable generation model. Starts from CONFIG; the UI's model
// switcher changes it live without a server restart. Embedding model is
// intentionally NOT switchable — changing it would invalidate the index.
let generationModel = CONFIG.generationModel;

export const getGenerationModel = (): string => generationModel;

export function setGenerationModel(model: string): void {
  generationModel = model;
}
