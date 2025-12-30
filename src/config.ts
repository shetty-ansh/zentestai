import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  geminiApiKey: string;
  maxSteps: number;
  maxFailures: number;
  maxRetries: number;
  maxLoopRetries: number;
  actionTimeout: number;
  observationTextLimit: number;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid value for ${key}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

export const config: Config = {
  geminiApiKey: getEnvVar('GEMINI_API_KEY'),
  maxSteps: getEnvNumber('MAX_STEPS', 200),
  maxFailures: getEnvNumber('MAX_FAILURES', 10),
  maxRetries: getEnvNumber('MAX_RETRIES', 3),
  maxLoopRetries: getEnvNumber('MAX_LOOP_RETRIES', 3),
  actionTimeout: getEnvNumber('ACTION_TIMEOUT', 30000),
  observationTextLimit: getEnvNumber('OBSERVATION_TEXT_LIMIT', 3000),
};

