import React, { useState } from 'react'
import { isEmpty } from 'lodash'
import { Link } from 'react-router-dom'

import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js'
import { MintLayout, Token } from '@solana/spl-token'

import { DataV2, Collection } from '@metaplex-foundation/mpl-token-metadata'

import BN from 'bn.js'

import './index.css'

import {
  getMetadataContent,
  prepPayForFilesTxn,
  createMint,
  toPublicKey,
  findProgramAddress,
  createAssociatedTokenAccountInstruction,
  createMetadataV2,
  sendTransactionWithRetry,
  uploadToArweave,
  updateMetadataV2,
  createMasterEditionV3
} from '../../helpers'

const CreateNFT = ({ AccountState, dispatchAccount }) => {
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [description, setDescription] = useState('')
  const [sellerFeeBasisPoints, setsellerFeeBasisPoints] = useState(0)
  const [file, setFile] = useState({})
  const [txLink, setTxLink] = useState('')

  const createSolanaNftHelper = async (keypair, metadataInput) => {
    const wallet = keypair

    const connection = new Connection(clusterApiUrl('devnet'))

    const metadata = metadataInput
    console.log('STEP 1: get metadataContent')
    const metadataContent = metadataInput
    console.log('----- ', metadataContent)

    console.log('STEP 2: get files array')
    const realFiles = [
      file,
      new File([JSON.stringify(metadataContent)], 'metadata.json') // create metadata.json file
    ]
    console.log('----- ', realFiles)

    console.log('STEP 3: prepay for files')
    const { instructions: pushInstructions, signers: pushSigners } =
      await prepPayForFilesTxn(wallet, realFiles)
    console.log('----- ', pushInstructions)

    console.log('STEP 4: Create Mint account')
    const tokenProgramId = new PublicKey(
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    )
    console.log('----- ', tokenProgramId)
    const mintRent = await connection.getMinimumBalanceForRentExemption(
      MintLayout.span
    )
    const payerPublicKey = wallet.publicKey.toBase58()
    console.log('----- ', payerPublicKey)
    const instructions = [...pushInstructions]
    const signers = [...pushSigners]
    const mintKey = createMint(
      instructions,
      wallet.publicKey,
      mintRent,
      0,
      toPublicKey(payerPublicKey),
      toPublicKey(payerPublicKey),
      signers
    ).toBase58()
    setTxLink(
      `https://solscan.io/token/${mintKey}?cluster=devnet`
    )
    console.log('----- ', mintKey) // NFT ID

    console.log('STEP 5: Create Token account')
    const associatedTokenProgramId = new PublicKey(
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
    )
    const recipientKey = (
      await findProgramAddress(
        [
          wallet.publicKey.toBuffer(),
          tokenProgramId.toBuffer(),
          toPublicKey(mintKey).toBuffer()
        ],
        associatedTokenProgramId
      )
    )[0]
    createAssociatedTokenAccountInstruction(
      instructions,
      toPublicKey(recipientKey),
      wallet.publicKey,
      wallet.publicKey,
      toPublicKey(mintKey)
    )
    console.log('----- instruction', instructions)

    console.log('STEP 6: Create metadata account')
    console.log('----- metadata', metadata)
    const metadataAccount = await createMetadataV2(
      new DataV2({
        symbol: metadata.symbol,
        name: metadata.name,
        uri: ' '.repeat(64), // size of url for arweave
        sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
        creators: metadata.creators,
        collection: metadata.collection
          ? new Collection({
              key: new PublicKey(metadata.collection).toBase58(),
              verified: false
            })
          : null,
        uses: metadata.uses || null
      }),
      payerPublicKey,
      mintKey,
      payerPublicKey,
      instructions,
      wallet.publicKey.toBase58()
    )
    console.log('----- metaAccount', metadataAccount)

    console.log('STEP 7: Send transaction')
    const { txid } = await sendTransactionWithRetry(
      connection,
      wallet,
      instructions,
      signers,
      'single'
    )
    console.log('----- Transaction id: ', txid)

    await connection.confirmTransaction(txid, 'max')

    console.log('STEP 8: Upload to Arweave')
    const data = new FormData()
    data.append('transaction', txid)
    data.append('env', 'devnet')

    console.log('----- transaction id', data.get('transaction'))
    console.log('----- env', data.get('env'))

    const tags = realFiles.reduce((acc, f) => {
      acc[f.name] = [{ name: 'mint', value: mintKey }]
      return acc
    }, {})

    data.append('tags', JSON.stringify(tags))
    realFiles.map((f) => data.append('file[]', f))

    const result = await uploadToArweave(data)
    console.log('----- result', result)

    console.log('STEP 9: Update metadata account')
    const metadataFile = result.messages?.find(
      (m) => m.filename === 'manifest.json'
    )

    if (metadataFile?.transactionId && wallet.publicKey) {
      const updateInstructions = []
      const updateSigners = []
      const arweaveLink = `https://arweave.net/${metadataFile.transactionId}`

      await updateMetadataV2(
        new DataV2({
          symbol: metadata.symbol,
          name: metadata.name,
          uri: arweaveLink,
          sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
          creators: metadata.creators,
          collection: metadata.collection
            ? new Collection({
                key: new PublicKey(metadata.collection).toBase58(),
                verified: false
              })
            : null,
          uses: metadata.uses || null
        }),
        undefined,
        undefined,
        mintKey,
        payerPublicKey,
        updateInstructions,
        metadataAccount
      )

      updateInstructions.push(
        Token.createMintToInstruction(
          tokenProgramId,
          toPublicKey(mintKey),
          toPublicKey(recipientKey),
          toPublicKey(payerPublicKey),
          [],
          1
        )
      )

      await createMasterEditionV3(
        new BN(0),
        mintKey,
        payerPublicKey,
        payerPublicKey,
        payerPublicKey,
        updateInstructions
      )

      await sendTransactionWithRetry(
        connection,
        wallet,
        updateInstructions,
        updateSigners
      )
    }
    console.log('DONE')
  }

  const createSolanaNFT = async () => {
    try {
      setIsLoading(true)
      setIsSuccess(false)
      const metadataContent = getMetadataContent(
        name,
        symbol,
        description,
        sellerFeeBasisPoints * 100,
        file,
        AccountState.walletInfo.address
      )

      await createSolanaNftHelper(AccountState.wallet, metadataContent)
      setIsLoading(false)
      setIsSuccess(true)
    } catch (error) {
      console.error(error)
      setIsLoading(false)
    }
  }

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
          <div className="page-subtitle">Create NFT Input Form</div>
          <div className="input-form">
            <div className="content-item">
              <label className="label-input">Name: </label>
              <input
                id="input-seedphrase"
                className="input-field"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="content-item">
              <label className="label-input">Symbol: </label>
              <input
                id="input-seedphrase"
                className="input-field"
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
            </div>

            <div className="content-item">
              <label className="label-input">
                Seller Fee Basis Points(%):{' '}
              </label>
              <input
                className="input-field"
                type="number"
                min={0}
                max={100}
                value={sellerFeeBasisPoints}
                onChange={(e) => setsellerFeeBasisPoints(e.target.value)}
              />
            </div>

            <div className="content-item">
              <label className="label-input">Description: </label>
              <input
                id="input-seedphrase"
                className="input-field"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <input
              className="field-input"
              type="file"
              onChange={(e) => setFile(e.target.files[0])}
            />

            <button
              className="button-submit"
              onClick={createSolanaNFT}
              disabled={isLoading}
            >
              Create Solana NFT
            </button>
          </div>
          {isLoading && (
            <div className="loading-text"> We are creating your NFT...</div>
          )}

          {isSuccess && (
            <div>
              <div className="result-text">You successfully created an NFT</div>
              <div className="result-text">
                You can find you transaction at the link:{' '}
                <a href={txLink} target='__blank'>Your transaction</a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CreateNFT
