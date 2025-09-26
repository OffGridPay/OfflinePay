import { ethers } from "ethers"

// TODO: Replace this with your actual relayer's public address.
// The relayer service prints its address to the console on startup.
const RELAYER_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"

/**
 * Verifies the relayer's signature on an acknowledgement.
 * @param {object} ack - The acknowledgement object received from the relayer.
 * @returns {boolean} - True if the signature is valid and from the expected relayer, false otherwise.
 */
export const verifyAck = (ack) => {
  if (!ack || !ack.relayerSig) {
    console.error("Missing ack or signature")
    return false
  }

  try {
    // Re-create the exact hash that the relayer signed
    const ackHash = ethers.utils.solidityKeccak256(
      ["bytes32", "uint256", "address", "address", "uint256", "string", "string"],
      [
        ack.txHash,
        ack.blockNumber,
        ack.from,
        ack.to,
        ack.value,
        ack.newBalances[ack.from],
        ack.newBalances[ack.to],
      ]
    )

    // Recover the address of the signer
    const signerAddress = ethers.utils.verifyMessage(ethers.utils.arrayify(ackHash), ack.relayerSig)

    // Compare the signer's address to the known relayer address
    const isValid = signerAddress.toLowerCase() === RELAYER_ADDRESS.toLowerCase()

    if (!isValid) {
      console.error(
        `Signature verification failed. Expected ${RELAYER_ADDRESS}, got ${signerAddress}`
      )
    }

    return isValid
  } catch (error) {
    console.error("Error during signature verification:", error)
    return false
  }
}
