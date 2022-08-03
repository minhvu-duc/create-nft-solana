import React from 'react'

import { isEmpty } from 'lodash'
import { Link } from 'react-router-dom'

const WalletInformation = ({ AccountState }) => {
  return (
    <div className="page-content">
      <Link to="/" className="back-link">
        Back
      </Link>

      {isEmpty(AccountState.wallet) ? (
        <div className="page-subtitle">
          Please back to previous page and import a solana wallet
        </div>
      ) : (
        <div>
          <div className="page-subtitle">Account Information</div>

          <div className="imported-result">
            <div className="result-item">
              <b>Seedphrase:</b> {AccountState.walletInfo.seedphrase}
            </div>
            <div className="result-item">
              <b>Address:</b> {AccountState.walletInfo.address}
            </div>
            <div className="result-item">
              <b>Balance:</b>{' '}
              {AccountState.walletInfo.balance / Math.pow(10, 9)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletInformation
