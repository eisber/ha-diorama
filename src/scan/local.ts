export type ScanTransform = { x: number; y: number; z: number; yaw: number; scale: number; opacity: number }
export type LocalScan = { buffer: ArrayBuffer; hash: string; transform: ScanTransform }
export const defaultTransform: ScanTransform = { x: 0, y: 0, z: 0, yaw: 0, scale: 1, opacity: 0.35 }

export async function scanCache(key: string, value?: LocalScan | null): Promise<LocalScan | null> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('diorama-private-scan-references', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('scans')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Close other Diorama tabs to open local scan storage'))
  })
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('scans', value === undefined ? 'readonly' : 'readwrite')
      const store = transaction.objectStore('scans')
      const request = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key)
      transaction.oncomplete = () => resolve(value === undefined ? (request.result ?? null) : value)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('Local scan storage was interrupted'))
    })
  } finally {
    database.close()
  }
}
