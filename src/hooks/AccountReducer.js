import { ACTION } from '../constants/constants'

/* 
AccountState = {
  wallet: keypair,
  metadataContent: metadata,
}
*/
const initialState = {}

export default function accountReducer(state = initialState, action) {
  switch (action.type) {
    case ACTION.WALLET:
      return { ...state, wallet: action.payload.wallet, connected: true, walletInfo: action.payload.walletInfo}
    case ACTION.METADATA:
      return { ...state, metadataContent: action.payload }
    case ACTION.DISCONNECT:
      return {}
    default:
      return state
  }
}
