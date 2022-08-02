import { useEffect, useState } from 'react'
import { PublicKey, Connection, clusterApiUrl, Keypair } from '@solana/web3.js'
import { MintLayout, Token } from '@solana/spl-token';

import { DataV2, Collection } from '@metaplex-foundation/mpl-token-metadata';

import { mnemonicToSeedSync } from 'bip39'
import { derivePath } from 'ed25519-hd-key'

import { Buffer } from 'buffer';

import BN from 'bn.js'

import { 
  getMetadataContent, 
  prepPayForFilesTxn, 
  createMint, 
  toPublicKey,
  findProgramAddress,
  createAssociatedTokenAccountInstruction,
  createMetadataV2,
  sendTransactionWithRetry,
  getWallet,
  uploadToArweave,
  updateMetadataV2,
  createMasterEditionV3
} from './helpers'

import './App.css';
import { BigNumber } from 'ethers';

window.Buffer = Buffer

function App() {
  const [imageFile, setImageFile] = useState(null)
  const [transactionId, setTransactionId] = useState(null)

  useEffect(() => {
    const load = async () => {

    }

    if (imageFile) load()

  }, [imageFile])

  const createSolanaNft = async () => {
    const seedphrase = 'struggle noble ocean glance december wreck problem cereal spoil menu way onion'
    const DEFAULT_DERIVE_PATH = `m/44'/501'/0'/0'`
    const bufferToString = (buffer) => Buffer.from(buffer).toString('hex')
    const deriveSeed = (seed) => derivePath(DEFAULT_DERIVE_PATH, seed).key
    let keypair
    const seed = mnemonicToSeedSync(seedphrase)
    keypair = Keypair.fromSeed(deriveSeed(bufferToString(seed)))
    const wallet = keypair
    const connection = new Connection(clusterApiUrl('devnet'))

    console.log('seedphrase', seedphrase)
    console.log('address', keypair.publicKey.toString())
    console.log(await connection.getBalance(keypair.publicKey))

    const metadata = getMetadataContent()

    console.log('STEP 1: get metadataContent')
    const metadataContent = getMetadataContent()
    console.log('----- ', metadataContent)

    console.log('STEP 2: get files array')
    const realFiles = [
      imageFile,
      new File([JSON.stringify(metadataContent)], 'metadata.json') // create metadata.json file
    ]
    console.log('----- ', realFiles)

    console.log('STEP 3: prepay for files')
    const { 
      instructions: pushInstructions, 
      signers: pushSigners 
    } = await prepPayForFilesTxn(wallet, realFiles)
    console.log('----- ', pushInstructions)

    console.log('STEP 4: Create Mint account')
    const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    console.log('----- ', tokenProgramId)
    const mintRent = await connection.getMinimumBalanceForRentExemption(MintLayout.span)
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
    console.log('----- ', mintKey)

    console.log('STEP 5: Create Token account')
    const associatedTokenProgramId = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
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
              verified: false,
            })
          : null,
        uses: metadata.uses || null,
      }),
      payerPublicKey,
      mintKey,
      payerPublicKey,
      instructions,
      wallet.publicKey.toBase58(),
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

    const tags = realFiles.reduce(
      (acc, f) => {
        acc[f.name] = [{ name: 'mint', value: mintKey }];
        return acc;
      },
      {},
    )

    data.append('tags', JSON.stringify(tags))
    realFiles.map(f => data.append('file[]', f))

    const result = await uploadToArweave(data)
    console.log('----- result', result)

    console.log('STEP 9: Update metadata account')
    const metadataFile = result.messages?.find(
      m => m.filename === 'manifest.json',
    )

    if (metadataFile?.transactionId && wallet.publicKey) {
      const updateInstructions = [];
      const updateSigners = [];
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
                verified: false,
              })
            : null,
          uses: metadata.uses || null,
        }),
        undefined,
        undefined,
        mintKey,
        payerPublicKey,
        updateInstructions,
        metadataAccount,
      )

      updateInstructions.push(
        Token.createMintToInstruction(
          tokenProgramId,
          toPublicKey(mintKey),
          toPublicKey(recipientKey),
          toPublicKey(payerPublicKey),
          [],
          1,
        ),
      );

      await createMasterEditionV3(
        new BN(0),
        mintKey,
        payerPublicKey,
        payerPublicKey,
        payerPublicKey,
        updateInstructions,
      );
  
      await sendTransactionWithRetry(
        connection,
        wallet,
        updateInstructions,
        updateSigners,
      )  
    }
    console.log('DONE')
  }

  return (
    <div className="App">
      <div>
        <input type='file' onChange={(e) => {
          setImageFile(e.target.files[0])
        }}/>
        <button>Test upload arweave</button>
        <button onClick={createSolanaNft}>Test create solana nft</button>
        <button onClick={getWallet}>Test get Wallet</button>
      </div>
    </div>
  );
}

export default App;
