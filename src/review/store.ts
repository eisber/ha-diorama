import type { HomeAssistant } from '../types.ts'
import { applyOperation, canonical, emptyReview, validateReview } from './model.ts'
import type { ReviewConfig, ReviewDocument, ReviewOperation } from './types.ts'

type Dashboard = { views: { cards?: Record<string, unknown>[]; [key: string]: unknown }[]; [key: string]: unknown }
export type ReviewAssistant = HomeAssistant & { user?: { id: string; name: string; is_admin: boolean } }

export class ReviewStore {
  private getHass: () => ReviewAssistant | null
  private config: ReviewConfig

  constructor(getHass: () => ReviewAssistant | null, config: ReviewConfig) {
    this.getHass = getHass
    this.config = config
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(config.storage) || !config.id || !config.frame)
      throw new Error('Review needs an ID, a coordinate frame and a dedicated hyphenated storage dashboard path')
  }

  private request<T>(type: string, args: Record<string, unknown> = {}) {
    const hass = this.getHass()
    if (!hass?.callWS) throw new Error('An authenticated Home Assistant websocket is required')
    return hass.callWS<T>({ type, url_path: this.config.storage, ...args })
  }

  private card(config: Dashboard) {
    if (!Array.isArray(config.views)) throw new Error('Unexpected review dashboard')
    const matches = config.views.flatMap(v => v.cards ?? []).filter(c => c.review_id === this.config.id)
    if (matches.length !== 1)
      throw new Error('Review storage has no unique owned review card. Initialize a separate empty dashboard')
    return matches[0]
  }

  async load() {
    const config = await this.request<Dashboard>('lovelace/config', { force: true })
    const document = this.card(config).diorama_review
    validateReview(document, this.config.frame)
    return structuredClone(document)
  }

  async initialize() {
    if (!this.getHass()?.user?.is_admin) throw new Error('An HA administrator must initialize shared review storage')
    const dashboards = await this.getHass()!.callWS!<{ url_path: string }[]>({ type: 'lovelace/dashboards/list' })
    if (dashboards.some(d => d.url_path === this.config.storage))
      throw new Error('That dashboard already exists. It will not be overwritten. Use a new dedicated storage path')
    await this.getHass()!.callWS!({
      type: 'lovelace/dashboards/create',
      url_path: this.config.storage,
      title: 'Diorama review storage',
      show_in_sidebar: false,
      require_admin: true,
      mode: 'storage',
    })
    const document = emptyReview(this.config.frame)
    await this.request('lovelace/config/save', {
      config: {
        title: 'Diorama review storage',
        views: [
          {
            title: 'Private review',
            path: 'review',
            cards: [
              {
                type: 'markdown',
                content: 'Private Diorama review data. Edit it through the review controls, not this card.',
                review_id: this.config.id,
                diorama_review: document,
              },
            ],
          },
        ],
      },
    })
    const verified = await this.load()
    if (canonical(document) !== canonical(verified)) throw new Error('Review initialization could not be verified')
    return verified
  }

  async save(operation: ReviewOperation): Promise<ReviewDocument> {
    if (!this.getHass()?.user?.is_admin) throw new Error('Saving review metadata requires an HA administrator')
    const write = async () => {
      const config = await this.request<Dashboard>('lovelace/config', { force: true })
      const card = this.card(config)
      validateReview(card.diorama_review, this.config.frame)
      const before = canonical(config)
      const next = applyOperation(card.diorama_review, operation)
      if (canonical(next) === canonical(card.diorama_review)) return structuredClone(next)
      const fresh = await this.request<Dashboard>('lovelace/config', { force: true })
      if (canonical(fresh) !== before)
        throw new Error('Review changed during save. Your draft is retained; reload and retry')
      card.diorama_review = next
      await this.request('lovelace/config/save', { config })
      const verified = await this.load()
      if (canonical(verified) !== canonical(next))
        throw new Error('Save not confirmed. Reload before retrying; the reply ID is retained')
      return verified
    }
    // HA has no cross-client compare-and-swap for Lovelace config. Serialize
    // this browser's writers and also compare fresh state and exact readback.
    return typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request(`diorama-review:${this.config.storage}`, write)
      : write()
  }
}
