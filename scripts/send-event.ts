import { loadConfig } from '../src/config.js'
import { buildHealthEvent } from '../src/webhooks/events.js'
import { deliverWebhookWithRetry } from '../src/webhooks/delivery.js'
import { createCalibrationPublicClient } from '../src/filecoin/client.js'
import { checkReceipt } from '../src/filecoin/checker.js'
import { readReceipt } from '../src/filecoin/receipt.js'

const config = loadConfig()
const client = createCalibrationPublicClient()
const receipt = await readReceipt(config.receiptPath)
const health = await checkReceipt(client, receipt)
const event = buildHealthEvent(health)
const delivery = await deliverWebhookWithRetry(config.demoWebhookUrl, event, config.webhookSecret)

console.log(JSON.stringify({ event, delivery }, null, 2))
if (!delivery.ok) process.exitCode = 1
