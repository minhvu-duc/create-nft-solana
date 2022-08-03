import React, { useState } from 'react'

import { Link } from 'react-router-dom'

import './index.css'

import { Connection, clusterApiUrl, Keypair } from '@solana/web3.js'

import { derivePath } from 'ed25519-hd-key'
import { mnemonicToSeedSync } from 'bip39'
import { isEmpty } from 'lodash'
import { ACTION } from '../../constants/constants'

// 'struggle noble ocean glance december wreck problem cereal spoil menu way onion'
const ImportWallet = ({ AccountState, dispatchAccount }) => {
  const [phrase, setPhrase] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const importWallet = async () => {
    try {
      setIsLoading(true)

      const seedphrase = phrase.trim()
      const DEFAULT_DERIVE_PATH = `m/44'/501'/0'/0'`
      const bufferToString = (buffer) => Buffer.from(buffer).toString('hex')
      const deriveSeed = (seed) => derivePath(DEFAULT_DERIVE_PATH, seed).key

      const seed = mnemonicToSeedSync(seedphrase)
      let keypair = Keypair.fromSeed(deriveSeed(bufferToString(seed)))
      const connection = new Connection(clusterApiUrl('devnet'))

      dispatchAccount({
        type: ACTION.WALLET,
        payload: {
          wallet: keypair,
          walletInfo: {
            seedphrase: phrase,
            address: keypair.publicKey.toString(),
            balance: await connection.getBalance(keypair.publicKey)
          }
        }
      })

      setIsLoading(false)
      setPhrase('')
    } catch (error) {
      console.error(error)
      setIsLoading(false)
      setPhrase('')
    }
  }

  const disconnectWallet = () => {
    dispatchAccount({ type: ACTION.DISCONNECT, payload: '' })
  }

  return (
    <div className="page-content">
      <Link to="/" className="back-link">
        Back
      </Link>
      <div className="page-subtitle"> Input your wallet seedphrase </div>

      <div className="input-form">
        <div className="content-item">
          <label htmlFor="input-seedphrase">Seedphrase: </label>
          <input
            id="input-seedphrase"
            className="input-field"
            type="text"
            value={phrase}
            disabled={!isEmpty(AccountState.wallet)}
            onChange={(e) => setPhrase(e.target.value)}
          />
        </div>

        {isEmpty(AccountState.wallet) ? (
          <button
            className="button-submit"
            onClick={importWallet}
            disabled={isLoading}
          >
            Import wallet
          </button>
        ) : (
          <button
            className="button-submit"
            onClick={disconnectWallet}
            disabled={isLoading}
          >
            Disconnect wallet
          </button>
        )}
      </div>

      {isLoading && (
        <div className="loading-text"> We are importing your wallet...</div>
      )}

      {!isEmpty(AccountState.wallet) && (
        <div className="imported-result">
          <div className="result-item">
            <b>Seedphrase:</b> {AccountState.walletInfo.seedphrase}
          </div>
          <div className="result-item">
            <b>Address:</b> {AccountState.walletInfo.address}
          </div>
          <div className="result-item">
            <b>Balance:</b> {AccountState.walletInfo.balance / Math.pow(10, 9)}
          </div>
        </div>
      )}
    </div>
  )
}

export default ImportWallet
