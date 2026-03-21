export async function checkProvider(baseUrl: string, timeout?: number): Promise<{
  available: boolean;
  models: string[];
  error?: string;
}> {
  try {
    const url = baseUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout ?? 5000);

    const response = await fetch(`${url}/models`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { available: true, models: [], error: `HTTP ${response.status}` };
    }

    const data = await response.json() as { data?: Array<{ id: string }> };
    const models = (data.data ?? []).map(m => m.id);
    return { available: true, models };
  } catch (err) {
    return {
      available: false,
      models: [],
      error: err instanceof Error ? err.message : 'Connection failed',
    };
  }
}
