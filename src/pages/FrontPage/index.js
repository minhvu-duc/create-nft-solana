import React from 'react'

import { Link } from 'react-router-dom'

import './index.css'

const FrontPage = () => {
  return <div className='page-content'>
    <div className='page-title'>Solana NFT Creation Sample Project</div>
    <div className='list-links'>
      <Link to='/wallet-information'>Wallet Information</Link>
      <Link to='/import-wallet'>Import Solana Wallet</Link>
      <Link to='/create-solana-nft'>Create Solana NFT</Link>
    </div>
  </div>
}
export default FrontPage
