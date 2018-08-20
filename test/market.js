let base = require('./lib/base')
let debug = require('debug')('market')
let assert = require('chai').assert
let ByteBuffer = require('bytebuffer')
let constants = require('../lib/constants')
let config = require('../config')

describe('market', () => {
  before(async function () {
    await base.initAsync()
  })

  it('should be ok to get all markets', async function () {
    let m = await base.dappApiGetAsync('/markets')
    debug('get all markets', m)
    assert(m.success)
    assert.exists(m.count)
    assert.isArray(m.markets)
  })

  it('should not find a non-existent market', async function () {
    let m = await base.dappApiGetAsync('/markets/non-existent')
    debug('get non-existent market', m)
    assert(!m.success)
    assert.match(m.error, /Market not found/)
  })

  describe('after create market', () => {
    let initiatorAccount = base.getRandomAccount()
    let trader1 = base.getRandomAccount()
    let trader2 = base.getRandomAccount()
    let trader3 = base.getRandomAccount()
    debug('initiator account', initiatorAccount)
    debug('trader1', trader1)
    debug('trader2', trader2)
    debug('trader3', trader3)

    let marketTransactionId
    let marketId

    before(async function () {
      let addresses = [initiatorAccount.address, trader1.address, trader2.address, trader3.address]
      await base.giveMoneyAndWaitAsync(addresses, 'XAS')

      let res = await base.dappApiGetAsync('/blocks/height')
      assert(res.success)

      let currentHeight = res.height
      res = await base.createMarketAsync({
        title: 'first market title',
        image: 'http://asch.so/logo.png',
        desc: 'first market desc',
        results: [
          'first choice',
          'second choice'
        ].join(','),
        currency: 'XAS',
        margin: '10000000000',
        share: 100,
        endHeight: currentHeight + 5
      }, initiatorAccount.secret)
      assert(res.success)
      assert(res.transactionId.length === 64)
      marketTransactionId = res.transactionId

      await base.onNewBlockAsync()
    })

    it('get market by transaction id', async function () {
      let res = await base.dappApiGetAsync('/markets?tid=' + marketTransactionId)
      assert(res.success)
      assert(res.count === 1)
      assert.isArray(res.markets)
      assert(res.markets.length === 1)
      assert(res.markets[0].tid === marketTransactionId)
      marketId = res.markets[0].id
    })

    it('get market by market id', async function () {
      let res = await base.dappApiGetAsync('/markets/' + marketId)
      assert(res.success)
      assert.isObject(res.market)
      assert(res.market.id === marketId)
    })

    it('normal trade', async function () {
      let res = await base.createTradeAsync({
        mid: marketId,
        share: 20,
        choice: 0
      }, trader1.secret)
      assert(res.success)
      assert(res.transactionId.length === 64)

      await base.onNewBlockAsync()

      res = await base.dappApiGetAsync('/markets/' + marketId + '/results')
      assert(res.success)
      assert.isArray(res.results)
      assert(res.results.length === 2)
      assert(res.results[0].share === 20)

      res = await base.dappApiGetAsync('/markets/' + marketId + '/trades')
      assert(res.success)
      assert(res.count > 0)
      assert.isArray(res.trades)

      res = await base.dappApiGetAsync('/markets/' + marketId + '/shares/' + trader1.address)
      assert(res.success)
      assert.isArray(res.shares)
      assert(res.shares.length > 0)

      res = await base.createTradeAsync({
        mid: marketId,
        share: 10,
        choice: 1
      }, trader2.secret)
      assert(res.success)
      assert(res.transactionId.length === 64)

      res = await base.createTradeAsync({
        mid: marketId,
        share: 30,
        choice: 1
      }, trader3.secret)
      assert(res.success)
      assert(res.transactionId.length === 64)

      await base.onNewBlockAsync()

      res = await base.createRevealAsync({
        mid: marketId,
        choice: 0
      }, base.genesisAccount.secret)
      assert(!res.success)
      assert.match(res.error, /Permission denied/)

      res = await base.createRevealAsync({
        mid: marketId,
        choice: 0
      }, initiatorAccount.secret)
      assert(!res.success)
      assert.match(res.error, /Time not arrived/)

      await base.onNewBlockAsync()
      await base.onNewBlockAsync()
      await base.onNewBlockAsync()
      await base.onNewBlockAsync()

      res = await base.dappApiGetAsync('/markets/' + marketId)
      assert(res.success)
      assert(res.market.state === constants.MARKET_STATE.REVEALING)

      res = await base.createRevealAsync({
        mid: marketId,
        choice: 0
      }, initiatorAccount.secret)
      assert(res.success)

      await base.onNewBlockAsync()
      await base.onNewBlockAsync()

      res = await base.dappApiGetAsync('/markets/' + marketId)
      assert(res.success)
      assert(res.market.state === constants.MARKET_STATE.ANNOUNCING)

      await base.onNewBlockAsync()
      await base.onNewBlockAsync()
      await base.onNewBlockAsync()
      await base.onNewBlockAsync()
      await base.onNewBlockAsync()
      await base.onNewBlockAsync()
      await base.onNewBlockAsync()

      let secrets = [
        initiatorAccount.secret,
        trader1.secret
      ]
      for (let secret of secrets) {
        debug('settle secret', secret)
        res = await base.createSettleAsync({
          mid: marketId
        }, secret)
        assert(res.success)
      }
      await base.onNewBlockAsync()

      res = await base.dappApiGetAsync('/markets/' + marketId)
      assert(res.success)
      let marketTotal = res.market.total

      res = await base.dappApiGetAsync('/markets/' + marketId + '/settles')
      assert(res.success)
      let sum = 0
      for (let settle of res.settles) {
        sum += Number(settle.amount)
      }
      assert(sum === Number(marketTotal))

    })

    it('normal comment', async function () {
      let res = await base.createCommentAsync({
        mid: marketId,
        content: 'first comment'
      }, base.genesisAccount.secret)
      assert(res.success)
      assert(res.transactionId.length === 64)

      await base.onNewBlockAsync()

      res = await base.dappApiGetAsync('/markets/' + marketId + '/comments')
      assert(res.success)
      assert(res.count > 0)
      assert.isArray(res.comments)
    })

    it.only('normal verdict', async function () {
      let res = await base.dappApiGetAsync('/blocks/height')
      assert(res.success)

      let currentHeight = res.height
      res = await base.createMarketAsync({
        title: 'first market title',
        image: 'http://asch.so/logo.png',
        desc: 'first market desc',
        results: [
          'first choice',
          'second choice'
        ].join(','),
        currency: 'XAS',
        margin: '10000000000',
        share: 100,
        endHeight: currentHeight + 100
      }, initiatorAccount.secret)
      assert(res.success)
      assert(res.transactionId.length === 64)
      let tid = res.transactionId

      await base.onNewBlockAsync()

      res = await base.dappApiGetAsync('/markets?tid=' + tid)
      assert(res.success)
      assert(res.count === 1)
      assert.isArray(res.markets)
      assert(res.markets.length === 1)
      assert(res.markets[0].tid === tid)
      let mid = res.markets[0].id

      let signatures = []
      let buffer = new ByteBuffer(1, true)
      buffer.writeInt(1007)
      buffer.writeString(mid)
      buffer.writeInt(0)
      buffer.flip()
      let bytes = buffer.toBuffer()

      for (let i = 0; i < Math.floor(config.secrets.length / 2) + 1; ++i) {
        let pk = base.getPublicKey(config.secrets[i])
        let sig = base.signBytes(bytes, config.secrets[i])
        signatures.push(pk + sig)
      }

      res = await base.createVerdictAsync({
        mid: mid,
        choice: 0,
        signatures: signatures.join(',')
      }, config.secrets[0])
      assert(res.success)

      await base.onNewBlockAsync()

      res = await base.dappApiGetAsync('/markets/' + mid)
      assert(res.success)
      assert(res.market.state === constants.MARKET_STATE.FINISHED)
    })
  })
})