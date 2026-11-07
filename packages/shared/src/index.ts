// Portable scaffold contract. Document and resource schemas belong to T02.
export const applicationName = 'Markdown Note Taker';

export interface HealthResponse {
  status: 'ok';
  application: typeof applicationName;
}
