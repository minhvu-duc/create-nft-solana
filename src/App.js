import React, { useReducer } from 'react'

import { Buffer } from 'buffer'

import './App.css'

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { isEmpty } from 'lodash'

import accountReducer from './hooks/AccountReducer'

import ImportWallet from './pages/ImportWallet'
import FrontPage from './pages/FrontPage'
import CreateNFT from './pages/CreateNFT'
import WalletInformation from './pages/WalletInformation'

window.Buffer = Buffer

const AccountState = {}

function App() {
  const [state, dispatch] = useReducer(accountReducer, AccountState)

  return (
    <div className="App">
      {!isEmpty(state.wallet) ? (
        <div className="wallet-state on">Wallet connected (devnet)</div>
      ) : (
        <div className="wallet-state off">Wallet disconnected</div>
      )}
      <BrowserRouter>
        <Routes>
          <Route
            path="import-wallet"
            element={
              <ImportWallet AccountState={state} dispatchAccount={dispatch} />
            }
          ></Route>
          <Route
            path="create-solana-nft"
            element={
              <CreateNFT AccountState={state} dispatchAccount={dispatch} />
            }
          ></Route>
          <Route
            path="wallet-information"
            element={
              <WalletInformation
                AccountState={state}
                dispatchAccount={dispatch}
              />
            }
          ></Route>
          <Route path="*" element={<FrontPage />}></Route>
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App
