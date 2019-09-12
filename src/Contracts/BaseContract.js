// @flow

import Web3EthAbi from 'web3-eth-abi'

import type EthClient from '../Client'
import type { TXEventEmitter } from '../types'

export default class Contract {
  _ethClient: EthClient
  _abi: Object
  _address: string

  constructor(ethClient: EthClient, abi: Object, address: string) {
    this._ethClient = ethClient
    this._address = address
    this._abi = abi
  }

  get ethClient() {
    return this._ethClient
  }

  get abi() {
    return this._abi
  }

  get address() {
    return this._address
  }

  getFunctionABI(name: string) {
    const abi = this.abi.find(a => a.name === name)
    if (!abi) {
      throw new Error(`"${name}" signature not found in ABI`)
    }
    return abi
  }

  encodeCall(name: string, params?: Array<any> = []) {
    const abi = this.getFunctionABI(name)
    return Web3EthAbi.encodeFunctionCall(abi, params)
  }

  decodeCallResult(name: string, result: Object): any {
    const abi = this.getFunctionABI(name)
    if (!abi.outputs.length) {
      return result
    }
    if (abi.outputs.length && !result) {
      throw new Error('Expected outputs but none returned')
    }
    if (abi.outputs.length > 1) {
      return Web3EthAbi.decodeParameters(abi.outputs, result)
    }
    return Web3EthAbi.decodeParameter(abi.outputs[0].type, result)
  }

  async call(method: string, params?: Array<any>) {
    const res = await this.ethClient.send('eth_call', [
      { data: this.encodeCall(method, params), to: this.address },
      'latest',
    ])
    return this.decodeCallResult(method, res)
  }

  async send(
    method: string,
    params: Array<any>,
    options: Object,
  ): Promise<TXEventEmitter> {
    return await this.ethClient.sendAndListen({
      ...options,
      to: this.address,
      data: this.encodeCall(method, params),
    })
  }

  decodeEventLog(eventName: string, log: Object): Object {
    const abi = this.abi.find(abi => {
      return abi.type === 'event' && abi.name === eventName
    })
    if (!abi) {
      throw new Error(`Event '${eventName}' not found in ABI`)
    }
    return Web3EthAbi.decodeLog(abi.inputs, log.data, log.topics.slice(1))
  }

  async subscribeToEvents(
    name: string,
    topics: Array<string> = [],
  ): Promise<string> {
    if (!this.ethClient.web3Provider.subscribe) {
      throw new Error('Subscriptions not supported')
    }
    const abi = this.abi.find(abi => {
      return abi.type === 'event' && abi.name === name
    })
    if (!abi) {
      throw new Error(`Event '${name}' not found in ABI`)
    }
    const encodedSig = Web3EthAbi.encodeEventSignature(abi)
    const params = [
      {
        address: this.address,
        topics: [encodedSig].concat(topics),
      },
    ]
    return this.ethClient.subscribe('logs', params)
  }

  async getPastEvents(name: string, params: Object): Promise<Array<Object>> {
    const abi = this.abi.find(abi => {
      return abi.type === 'event' && abi.name === name
    })
    if (!abi) {
      throw new Error(`Event '${name}' not found in ABI`)
    }

    const encodedSig = Web3EthAbi.encodeEventSignature(abi)
    const res = await this.ethClient.getPastEvents({
      ...params,
      address: this.address,
      topics: [encodedSig].concat(params.topics || []),
    })

    const events = []
    res.forEach(log => {
      try {
        const event = this.decodeEventLog(name, log)
        events.push(event)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Error parsing event log: ', err)
      }
    })
    return events
  }
}
