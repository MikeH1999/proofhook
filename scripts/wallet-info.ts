import { formatEther, formatUnits } from 'viem'
import { requirePrivateKey } from '../src/config.js'
import { createCalibrationSynapse } from '../src/filecoin/client.js'

const synapse = createCalibrationSynapse(requirePrivateKey())
const address = synapse.client.account.address

const [filBalance, walletUsdfc, depositedUsdfc] = await Promise.all([
  synapse.client.getBalance({ address }),
  synapse.payments.walletBalance(),
  synapse.payments.balance(),
])

console.log(
  JSON.stringify(
    {
      chain: 'calibration',
      address,
      fil: formatEther(filBalance),
      walletUsdfc: formatUnits(walletUsdfc, synapse.payments.decimals()),
      depositedUsdfc: formatUnits(depositedUsdfc, synapse.payments.decimals()),
    },
    null,
    2
  )
)
