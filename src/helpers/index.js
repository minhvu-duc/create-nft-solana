import { 
  PublicKey, 
  SystemProgram, 
  LAMPORTS_PER_SOL, 
  TransactionInstruction,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { calculate } from '@metaplex/arweave-cost'
import crypto from 'crypto-browserify'
import { MintLayout, Token } from '@solana/spl-token'
import { serialize } from 'borsh'
import { DataV2, CreateMetadataV2Args, UpdateMetadataV2Args, CreateMasterEditionV3Args } from '@metaplex-foundation/mpl-token-metadata'
import { Buffer } from 'buffer'

import { mnemonicToSeedSync } from 'bip39'
import { derivePath } from 'ed25519-hd-key'

export const getMetadataContent = () => {
  return {
    name: 'example_name_102',
    symbol: 'EXS',
    description: 'this is an example description',
    sellerFeeBasisPoints: 2000, // 1000 === 10%
    image: 'example_2.jpg',
    animation_url: undefined,
    external_url: '',
    properties: {
      category: 'image',
      files: [
        {
          type: 'image/jpeg',
          uri: 'example_2.jpg'
        }
      ]
    },
    creators: [
      new Creator({
        address: '8JSfQqjH8ZGzcB2NhVDBMGAJEsptGYjcoYKLDcQDXXAc',
        share: 100,
        verified: true
      })
    ],
    collection: null
  }
}

/* 
  PREPAY HELPER
*/
export const prepPayForFilesTxn = async (wallet, files) => {
  const arSolHolder = new PublicKey('6FKvsq4ydWFci6nGq9ckbjYMtnmaqAoatz5c9XWjiDuS')
  const memo = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

  const instructions = []
  const signers = []

  const cost = await getAssetCostToStore(files)
  console.log('----- cost', cost / LAMPORTS_PER_SOL)

  if (wallet.publicKey) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: arSolHolder,
        lamports: Math.ceil(cost) + 1000000
      })
    )
  }

  for (let i = 0; i < files.length; i++) {
    const hashSum = crypto.createHash('sha256')
    hashSum.update(await files[i].text())
    const hex = hashSum.digest('hex')
    instructions.push(
      new TransactionInstruction({
        keys: [],
        programId: memo,
        data: Buffer.from(hex)
      })
    ) 
  }
  
  return {
    instructions,
    signers
  }
}

export async function getAssetCostToStore(files) {
  const sizes = files.map(f => f.size);
  const result = await calculate(sizes);

  return LAMPORTS_PER_SOL * result.solana;
}

/* 
  CREATE MINT HELPER
*/
export const createMint = (
  instructions,
  payer,
  mintRentExempt,
  decimals,
  owner,
  freezeAuthority,
  signers
) => {
  const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  const account = createUninitializedMint(
    instructions,
    payer,
    mintRentExempt,
    signers
  )
  instructions.push(
    Token.createInitMintInstruction(
      tokenProgramId,
      account,
      decimals,
      owner,
      freezeAuthority
    )
  )
  
  return account
}

const createUninitializedMint = (
  instructions,
  payer,
  amount,
  signers
) => {
  const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  const account = Keypair.generate()
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account.publicKey,
      lamports: amount,
      space: MintLayout.span,
      programId: tokenProgramId
    })
  )

  signers.push(account)

  return account.publicKey
}

const PubKeysInternedMap = new Map()

export const toPublicKey = (key) => {
  if (typeof key !== 'string') {
    return key;
  }

  let result = PubKeysInternedMap.get(key);
  if (!result) {
    result = new PublicKey(key);
    PubKeysInternedMap.set(key, result);
  }

  return result;
};

export const findProgramAddress = async (seeds, programId) => {
  const result = await PublicKey.findProgramAddress(seeds, programId)

  return [result[0].toBase58(), result[1]]
}

export const createAssociatedTokenAccountInstruction = (
  instructions,
  associatedTokenAddress,
  payer,
  walletAddress,
  splTokenMintAddress
) => {
  const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  const SYSVAR_RENT_PUBKEY = new PublicKey('SysvarRent111111111111111111111111111111111')
  const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey(
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  )

  const keys = [
    {
      pubkey: payer,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: associatedTokenAddress,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: walletAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: splTokenMintAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: tokenProgramId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  instructions.push(
    new TransactionInstruction({
      keys,
      programId: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
      data: Buffer.from([])
    })
  )
}

/* 
  CREATE METADATA HELPER
*/

class CreateMetadataArgs {
  constructor(args) {
    this.data = args.data;
    this.isMutable = args.isMutable;
  }
}
class UpdateMetadataArgs {
  constructor(args) {
    this.data = args.data ? args.data : null;
    this.updateAuthority = args.updateAuthority ? args.updateAuthority : null;
    this.primarySaleHappened = args.primarySaleHappened;
  }
}

class CreateMasterEditionArgs {
  constructor(args) {
    this.maxSupply = args.maxSupply;
  }
}

class MintPrintingTokensArgs {
  constructor(args) {
    this.supply = args.supply;
  }
}

export class Data {
  constructor(args) {
    this.name = args.name;
    this.symbol = args.symbol;
    this.uri = args.uri;
    this.sellerFeeBasisPoints = args.sellerFeeBasisPoints;
    this.creators = args.creators;
  }
}

export const MetadataKey = {
  Uninitialized: 0,
  MetadataV1: 4,
  EditionV1: 1,
  MasterEditionV1: 2,
  MasterEditionV2: 6,
  EditionMarker: 7,
}

export class MasterEditionV1 {
  constructor(args) {
    this.key = MetadataKey.MasterEditionV1;
    this.supply = args.supply;
    this.maxSupply = args.maxSupply;
    this.printingMint = args.printingMint;
    this.oneTimePrintingAuthorizationMint =
      args.oneTimePrintingAuthorizationMint;
  }
}

export class MasterEditionV2 {
  constructor(args) {
    this.key = MetadataKey.MasterEditionV2;
    this.supply = args.supply;
    this.maxSupply = args.maxSupply;
  }
}

export class Edition {
  constructor(args) {
    this.key = MetadataKey.EditionV1;
    this.parent = args.parent;
    this.edition = args.edition;
  }
}

export class Creator {
  constructor(args) {
    this.address = args.address;
    this.verified = args.verified;
    this.share = args.share;
  }
}

export class Metadata {
  constructor(args) {
    this.key = MetadataKey.MetadataV1;
    this.updateAuthority = args.updateAuthority;
    this.mint = args.mint;
    this.data = args.data;
    this.primarySaleHappened = args.primarySaleHappened;
    this.isMutable = args.isMutable;
    this.editionNonce = args.editionNonce ?? null;
    this.collection = args.collection ?? null;
    this.uses = args.uses ?? null;
  }

  async init() {
    this.edition = await getEdition(this.mint);
    this.masterEdition = this.edition;
  }
}

export class EditionMarker {
  constructor(args) {
    this.key = MetadataKey.EditionMarker;
    this.ledger = args.ledger;
  }

  editionTaken(edition) {
    const editionOffset = edition % 248;
    const indexOffset = Math.floor(editionOffset / 8);

    if (indexOffset > 30) {
      throw Error('bad index for edition');
    }

    const positionInBitsetFromRight = 7 - (editionOffset % 8);

    const mask = Math.pow(2, positionInBitsetFromRight);

    const appliedMask = this.ledger[indexOffset] & mask;

    return appliedMask !== 0;
  }
}


export async function getEdition(tokenMint) {
  const metadataProgramId = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')


  return (
    await findProgramAddress(
      [
        Buffer.from('metadata'),
        toPublicKey(metadataProgramId).toBuffer(),
        toPublicKey(tokenMint).toBuffer(),
        Buffer.from('edition'),
      ],
      toPublicKey(metadataProgramId),
    )
  )[0];
}


export const METADATA_SCHEMA = new Map([
  [
    CreateMetadataArgs,
    {
      kind: 'struct',
      fields: [
        ['instruction', 'u8'],
        ['data', Data],
        ['isMutable', 'u8'], // bool
      ],
    },
  ],
  [
    UpdateMetadataArgs,
    {
      kind: 'struct',
      fields: [
        ['instruction', 'u8'],
        ['data', { kind: 'option', type: Data }],
        ['updateAuthority', { kind: 'option', type: 'pubkeyAsString' }],
        ['primarySaleHappened', { kind: 'option', type: 'u8' }],
      ],
    },
  ],

  [
    CreateMasterEditionArgs,
    {
      kind: 'struct',
      fields: [
        ['instruction', 'u8'],
        ['maxSupply', { kind: 'option', type: 'u64' }],
      ],
    },
  ],
  [
    MintPrintingTokensArgs,
    {
      kind: 'struct',
      fields: [
        ['instruction', 'u8'],
        ['supply', 'u64'],
      ],
    },
  ],
  [
    MasterEditionV1,
    {
      kind: 'struct',
      fields: [
        ['key', 'u8'],
        ['supply', 'u64'],
        ['maxSupply', { kind: 'option', type: 'u64' }],
        ['printingMint', 'pubkeyAsString'],
        ['oneTimePrintingAuthorizationMint', 'pubkeyAsString'],
      ],
    },
  ],
  [
    MasterEditionV2,
    {
      kind: 'struct',
      fields: [
        ['key', 'u8'],
        ['supply', 'u64'],
        ['maxSupply', { kind: 'option', type: 'u64' }],
      ],
    },
  ],
  [
    Edition,
    {
      kind: 'struct',
      fields: [
        ['key', 'u8'],
        ['parent', 'pubkeyAsString'],
        ['edition', 'u64'],
      ],
    },
  ],
  [
    Data,
    {
      kind: 'struct',
      fields: [
        ['name', 'string'],
        ['symbol', 'string'],
        ['uri', 'string'],
        ['sellerFeeBasisPoints', 'u16'],
        ['creators', { kind: 'option', type: [Creator] }],
      ],
    },
  ],
  [
    Creator,
    {
      kind: 'struct',
      fields: [
        ['address', 'pubkeyAsString'],
        ['verified', 'u8'],
        ['share', 'u8'],
      ],
    },
  ],
  [
    Metadata,
    {
      kind: 'struct',
      fields: [
        ['key', 'u8'],
        ['updateAuthority', 'pubkeyAsString'],
        ['mint', 'pubkeyAsString'],
        ['data', Data],
        ['primarySaleHappened', 'u8'], // bool
        ['isMutable', 'u8'], // bool
        ['editionNonce', { kind: 'option', type: 'u8' }],
      ],
    },
  ],
  [
    EditionMarker,
    {
      kind: 'struct',
      fields: [
        ['key', 'u8'],
        ['ledger', [31]],
      ],
    },
  ],
]);

export const createMetadataV2 = async (
  data,
  updateAuthority,
  mintKey,
  mintAuthorityKey,
  instructions,
  payer
) => {
  const metadataProgramId = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

  const metadataAccount = (
    await findProgramAddress(
      [
      Buffer.from('metadata'),
      toPublicKey(metadataProgramId).toBuffer(),
      toPublicKey(mintKey).toBuffer()
      ],
      toPublicKey(metadataProgramId)
    )
  )[0]

  console.log('----- metadataAccount', metadataAccount)
  console.log('----- data', data)

  const txnData = Buffer.from(
    serialize(
      new Map([
        DataV2.SCHEMA,
        ...METADATA_SCHEMA,
        ...CreateMetadataV2Args.SCHEMA,
      ]),
      new CreateMetadataV2Args({ data, isMutable: true }),
    ),
  )

  const SYSVAR_RENT_PUBKEY = new PublicKey('SysvarRent111111111111111111111111111111111');

  const keys = [
    {
      pubkey: toPublicKey(metadataAccount),
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: toPublicKey(mintKey),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: toPublicKey(mintAuthorityKey),
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: toPublicKey(payer),
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: toPublicKey(updateAuthority),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  instructions.push(
    new TransactionInstruction({
      keys,
      programId: toPublicKey(metadataProgramId),
      data: txnData,
    }),
  );

  return metadataAccount;
}

export const sendTransactionWithRetry = async (
  connection,
  wallet,
  instructions,
  signers,
  commitment,
  includesFeePayer,
  block,
  beforeSend
) => {
  let transaction = new Transaction();
  instructions.forEach(instruction => transaction.add(instruction));
  transaction.recentBlockhash = (
    block || (await connection.getRecentBlockhash(commitment))
  ).blockhash;

  const txid = await sendAndConfirmTransaction(connection, transaction, [wallet, ...signers])

  return { txid };
};

export const getWallet = () => {
  const seedphrase = 'struggle noble ocean glance december wreck problem cereal spoil menu way onion'
  const DEFAULT_DERIVE_PATH = `m/44'/501'/0'/0'`
  const bufferToString = (buffer) => Buffer.from(buffer).toString('hex')
  const deriveSeed = (seed) => derivePath(DEFAULT_DERIVE_PATH, seed).key
  let keypair
  const seed = mnemonicToSeedSync(seedphrase)
  keypair = Keypair.fromSeed(deriveSeed(DEFAULT_DERIVE_PATH, bufferToString(seed)))

  console.log(keypair.publicKey.toString())

  return keypair
}

export const uploadToArweave = async (data) => {
  const resp = await fetch('https://us-central1-metaplex-studios.cloudfunctions.net/uploadFile', {
    method: 'POST',
    body: data,
  });

  if (!resp.ok) {
    return Promise.reject(
      new Error(
        'Unable to upload the artwork to Arweave. Please wait and then try again.',
      ),
    );
  }

  const result = await resp.json();

  if (result.error) {
    return Promise.reject(new Error(result.error));
  }

  return result;
};

export async function updateMetadataV2(
  data,
  newUpdateAuthority,
  primarySaleHappened,
  mintKey,
  updateAuthority,
  instructions,
  metadataAccount,
  isMutable,
) {
  const metadataProgramId = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

  metadataAccount =
    metadataAccount ||
    (
      await findProgramAddress(
        [
          Buffer.from('metadata'),
          toPublicKey(metadataProgramId).toBuffer(),
          toPublicKey(mintKey).toBuffer(),
        ],
        toPublicKey(metadataProgramId),
      )
    )[0];

  const value = new UpdateMetadataV2Args({
    data,
    updateAuthority: !newUpdateAuthority ? undefined : newUpdateAuthority,
    primarySaleHappened:
      primarySaleHappened === null || primarySaleHappened === undefined
        ? null
        : primarySaleHappened,
    isMutable: typeof isMutable == 'boolean' ? isMutable : null,
  });
  const txnData = Buffer.from(
    serialize(
      new Map([
        DataV2.SCHEMA,
        ...METADATA_SCHEMA,
        ...UpdateMetadataV2Args.SCHEMA,
      ]),
      value,
    ),
  );
  const keys = [
    {
      pubkey: toPublicKey(metadataAccount),
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: toPublicKey(updateAuthority),
      isSigner: true,
      isWritable: false,
    },
  ];
  instructions.push(
    new TransactionInstruction({
      keys,
      programId: toPublicKey(metadataProgramId),
      data: txnData,
    }),
  );

  return metadataAccount;
}

export async function createMasterEditionV3(
  maxSupply,
  mintKey,
  updateAuthorityKey,
  mintAuthorityKey,
  payer,
  instructions,
) {
  const metadataProgramId = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')

  const metadataAccount = (
    await findProgramAddress(
      [
        Buffer.from('metadata'),
        toPublicKey(metadataProgramId).toBuffer(),
        toPublicKey(mintKey).toBuffer(),
      ],
      toPublicKey(metadataProgramId),
    )
  )[0];

  const editionAccount = (
    await findProgramAddress(
      [
        Buffer.from('metadata'),
        toPublicKey(metadataProgramId).toBuffer(),
        toPublicKey(mintKey).toBuffer(),
        Buffer.from('edition'),
      ],
      toPublicKey(metadataProgramId),
    )
  )[0];

  const value = new CreateMasterEditionV3Args({ maxSupply: maxSupply || null });
  const txnData = Buffer.from(
    serialize(
      new Map([
        DataV2.SCHEMA,
        ...METADATA_SCHEMA,
        ...CreateMasterEditionV3Args.SCHEMA,
      ]),
      value,
    ),
  );
  const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  const SYSVAR_RENT_PUBKEY = new PublicKey('SysvarRent111111111111111111111111111111111')
  const keys = [
    {
      pubkey: toPublicKey(editionAccount),
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: toPublicKey(mintKey),
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: toPublicKey(updateAuthorityKey),
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: toPublicKey(mintAuthorityKey),
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: toPublicKey(payer),
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: toPublicKey(metadataAccount),
      isSigner: false,
      isWritable: false,
    },

    {
      pubkey: tokenProgramId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  instructions.push(
    new TransactionInstruction({
      keys,
      programId: toPublicKey(metadataProgramId),
      data: txnData,
    }),
  );
}
