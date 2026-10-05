export function contentDeletionCommand(slug: string, idempotencyKey: string) {
  return {
    confirmation: `DELETE ${slug.trim()}`,
    idempotencyKey,
  };
}

export function contentDeletionStepUpHeader(proof?: string): Record<string, string> {
  const normalized = proof?.trim();
  return normalized ? { "X-Rinspace-Step-Up": normalized } : {};
}
