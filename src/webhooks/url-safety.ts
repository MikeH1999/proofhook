import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export function isPrivateIp(address: string): boolean {
  if (address === '::1' || address === '::') return true

  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number)
    const first = parts[0] ?? -1
    const second = parts[1] ?? -1
    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first === 0
    )
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase()
    return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
  }

  return false
}

export async function assertSafeWebhookUrl(rawUrl: string, allowPrivate: boolean): Promise<URL> {
  const url = new URL(rawUrl)
  if (url.username || url.password) throw new Error('Webhook URLs cannot include credentials')

  const localHttp = allowPrivate && url.protocol === 'http:'
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('Webhook URLs must use HTTPS')
  }

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost') {
    if (!allowPrivate) throw new Error('Private webhook targets are not allowed')
    return url
  }

  const directIp = isIP(hostname) ? [hostname] : []
  const resolved = directIp.length > 0 ? directIp : (await lookup(hostname, { all: true })).map((item) => item.address)
  if (!allowPrivate && resolved.some(isPrivateIp)) {
    throw new Error('Private webhook targets are not allowed')
  }

  return url
}
