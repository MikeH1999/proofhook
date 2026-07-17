import { loadConfig } from '../src/config.js'
import { createCalibrationPublicClient } from '../src/filecoin/client.js'
import { checkReceipt } from '../src/filecoin/checker.js'
import { readReceipt } from '../src/filecoin/receipt.js'

const config = loadConfig()
const client = createCalibrationPublicClient()
const receipt = await readReceipt(config.receiptPath)
const health = await checkReceipt(client, receipt)

console.log(JSON.stringify(health, null, 2))
if (health.state === 'unhealthy' || health.state === 'unknown') process.exitCode = 1
