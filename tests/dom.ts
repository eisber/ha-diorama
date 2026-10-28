// Minimal custom-element shell. Tests dispatch real EventTarget events and
// exercise production hosts without bringing a browser or renderer into Node.
export class Element extends EventTarget {
  localName = 'div'
  children: Element[] = []
  parentElement: Element | null = null
  shadowRoot: Element | null = null
  isConnected = false
  hidden = false
  textContent = ''
  className = ''
  dataset: Record<string, string> = {}
  attributes = new Map<string, string>()
  style = { cssText: '', setProperty() {}, removeProperty() {} }
  classList = { contains: (name: string) => this.className.split(' ').includes(name) }
  get firstElementChild() {
    return this.children[0] ?? null
  }
  attachShadow() {
    return (this.shadowRoot = new Element())
  }
  append(...children: Element[]) {
    for (const child of children) {
      this.children.push(child)
      child.parentElement = this
    }
  }
  appendChild(child: Element) {
    this.append(child)
    return child
  }
  replaceChildren(...children: Element[]) {
    this.children = []
    this.append(...children)
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  removeAttribute(name: string) {
    this.attributes.delete(name)
  }
  hasAttribute(name: string) {
    return this.attributes.has(name)
  }
  toggleAttribute(name: string, force: boolean) {
    if (force) this.setAttribute(name, '')
    else this.removeAttribute(name)
  }
  getClientRects() {
    return []
  }
}

export class HuiCard extends Element {
  config: Record<string, unknown> = {}
  hass: unknown
  preview = false
  constructor() {
    super()
    this.localName = 'hui-card'
  }
  load() {}
}

export function installDom() {
  const cards: HuiCard[] = []
  const registry = new Map<string, unknown>()
  Object.assign(globalThis, {
    HTMLElement: Element,
    document: {
      head: new Element(),
      getElementById: () => null,
      createElement: (name: string) => {
        const element = name === 'hui-card' ? new HuiCard() : new Element()
        element.localName = name
        if (element instanceof HuiCard) cards.push(element)
        return element
      },
    },
    window: new EventTarget(),
    customElements: {
      whenDefined: async () => {},
      get: (name: string) => registry.get(name),
      define: (name: string, value: unknown) => registry.set(name, value),
    },
    matchMedia: () => ({ matches: true }),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  })
  return { cards }
}
