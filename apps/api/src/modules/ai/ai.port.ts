export interface AiPort {
  summarize(input: {
    entityType: string
    entityId: string
    locale: string
  }): Promise<{ content: string }>
  suggestNext(input: {
    opportunityId: string
    locale: string
  }): Promise<{ suggestions: string[] }>
  risk(input: {
    opportunityId: string
    locale: string
  }): Promise<{ level: 'LOW' | 'MEDIUM' | 'HIGH'; reasons: string[] }>
}
