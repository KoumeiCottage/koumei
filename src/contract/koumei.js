let ByteBuffer = require('bytebuffer')
let constants = require('../lib/constants')

const MARKET_STATE = constants.MARKET_STATE

module.exports = {
  createMarket: async function (title, image, desc, results, currency, margin, endTimestamp, category) {
    if (currency !== 'KMC') return 'Invalid currency'
    app.validate('string', title, { length: { minimum: 5, maximum: 256 } })
    //app.validate('string', image, {length: { minimum: 15, maximum: 256 }})
    //app.validate('string', image, {url: { schemes: ["http", "https"] }})
    app.validate('string', desc, { length: { minimum: 15, maximum: 4096 } })
    app.validate('string', margin, { number: { greaterThanOrEqualTo: 100 } })
    results = results.split(',')
    if (!Array.isArray(results) || results.length < 2) return 'Invalid result options'
    resultsSet = new Set(results)
    if (results.length !== resultsSet.size) return 'There are repetitive answers'

    const bignum = app.util.bignumber
    let total = bignum(margin).mul(Math.log(results.length).toFixed(constants.MAX_DIGITS_PRECISION) * Math.pow(10, constants.MAX_DIGITS_PRECISION)).toString()
    let balance = this.sender.kmc
    app.logger.debug('--------------------------balance,balance_type,total,total_type:', balance, typeof (balance), total, typeof (total))
    if (bignum(balance).lt(total)) return 'Insufficient balance ' + currency

    let mid = app.autoID.increment('market_max_id')
    app.sdb.create('Market', {
      id: mid,
      tid: this.trs.id,
      initiator: this.trs.senderId,
      timestamp: this.trs.timestamp,
      title: title,
      image: image,
      desc: desc,
      results: results.length,
      currency: currency,
      margin: margin,
      share: 0,
      endHeight: 0,
      revealHeight: 0,
      endTimestamp: app.getTime(endTimestamp),
      total: total,
      state: MARKET_STATE.ONGOING,
      revealChoice: -1,
      verdictChoice: -1,
      deposit: total,
      category: category
    })
    for (let i in results) {
      app.sdb.create('Result', {
        mid: mid,
        choice: i,
        desc: results[i],
        share: 0
      })
    }
    // app.balances.decrease(this.trs.senderId, currency, total)
    app.sdb.increase('Account', { kmc: -1 * Number(total) }, { address: this.trs.senderId })
  },
  trade: async function (mid, share, choice) {
    let market = await app.sdb.findOne('Market', { condition: { id: mid } })
    if (!market) return 'Market not found'
    if (market.state > MARKET_STATE.ONGOING) return 'Trade already closed'
    if (modules.blocks.getLastBlock().timestamp > market.endTimestamp) return 'Out of date,Trade already closed'

    let shareCond = { mid: mid, address: this.trs.senderId, choice: choice }
    let shareItem = app.sdb.get('Share', shareCond)
    if (share < 0 && (!shareItem || shareItem.share < -share)) {
      return 'Insufficient share'
    }

    let results = await app.sdb.findAll('Result', { condition: { mid: mid } })
    let v1 = 0
    let v2 = 0
    for (let i of results) {
      let choiceItem = app.sdb.get('Result', { mid: mid, choice: i.choice })
      let choiceShare = choiceItem.share
      v1 += Math.exp(choiceShare / market.margin)
      if (i.choice === choice) {
        v2 += Math.exp((choiceShare + share) / market.margin)
      } else {
        v2 += Math.exp(choiceShare / market.margin)
      }
    }
    if (v1 === Infinity || v2 === Infinity) {
      return '[Contract]: Insufficient amount'
    }

    const bignum = app.util.bignumber
    let c1 = bignum(market.margin).mul(Math.log(v1).toFixed(constants.MAX_DIGITS_PRECISION))
    let c2 = bignum(market.margin).mul(Math.log(v2).toFixed(constants.MAX_DIGITS_PRECISION))
    let amount = (bignum(c2).sub(c1)).mul(Math.pow(10, constants.MAX_DIGITS_PRECISION)).toString()
    app.logger.debug('amount is ', amount)
    if (bignum(this.sender.kmc).lt(amount)) return 'Insufficient balance'

    app.sdb.create('Trade', {
      mid: mid,
      tid: this.trs.id,
      trader: this.trs.senderId,
      choice: choice,
      share: share,
      amount: amount
    })
    app.sdb.increase('Result', { share: share }, { mid: mid, choice: choice })

    if (!shareItem) {
      app.sdb.create('Share', {
        share: 0,
        mid: mid,
        address: this.trs.senderId,
        choice: choice
      })
    }
    app.sdb.increase('Share', { share: share }, shareCond)
    app.sdb.increase('Market', { total: amount }, { id: mid })
    app.sdb.increase('Market', { tradingTimes: 1 }, { id: mid })
    app.sdb.increase('Result', { tradingTimes: 1 }, { mid: mid, choice: choice })
    if (Number(amount) > 0) {
      // app.balances.decrease(this.trs.senderId, market.currency, amount)
      app.sdb.increase('Account', { kmc: -1 * Number(amount) }, { address: this.trs.senderId })
    } else {
      // app.balances.increase(this.trs.senderId, market.currency, Math.abs(amount))
      app.sdb.increase('Account', { kmc: Math.abs(amount) }, { address: this.trs.senderId })
    }
  },
  settle: async function (mid) {
    let senderId = this.trs.senderId
    let bankerProfit = 0
    let amount = 0

    let market = await app.sdb.findOne('Market', { condition: { id: mid } })
    if (!market) return { success: false, error: 'Market not found' }
    if (market.state < MARKET_STATE.FINISHED) return 'Market not finished'

    let correctChoice = market.verdictChoice >= 0 ? market.verdictChoice : market.revealChoice
    if (correctChoice < 0) return { success: false, error: 'Invalid market state or final result' }

    app.sdb.lock('settle@' + senderId + '_' + mid)
    let settleCond = { mid: mid, address: senderId }
    let dbSettle = await app.sdb.findOne('Settle', { condition: settleCond })
    if (dbSettle) return 'Already had been settled!'

    let correctShare = await app.sdb.findOne('Result', { condition: { mid: mid, choice: correctChoice } })
    if (correctShare) {
      bankerProfit = market.total - (correctShare.share * Math.pow(10, constants.MAX_DIGITS_PRECISION))
    } else {
      bankerProfit = market.total
    }
    app.logger.debug({
      'bankerProfit': correctShare.share,
      'total': market.total,
      correctShare,
      'deposit': market.deposit
    }
    )

    let myShare = await app.sdb.findOne('Share', { condition: { mid: mid, address: senderId, choice: correctChoice } })
    // initiator may have shares.
    if (myShare) {
      app.logger.debug('----------------settle,Find shares')
      let settledShare = myShare.share * Math.pow(10, constants.MAX_DIGITS_PRECISION)
      if (market.initiator !== senderId) {
        // normal user
        if (settledShare == 0) return 'You have 0 share in this market!'
        if (settledShare > 0) {
          amount = settledShare
          app.logger.debug('----------- settle,normal user amount', amount)
        }
      } else {
        amount = settledShare + bankerProfit
        app.logger.debug('----------- settle,initiator user with shares amount', amount)
      }
      app.sdb.create('Settle', {
        mid: mid,
        tid: this.trs.id,
        address: senderId,
        amount: amount,
        share: myShare.share
      })
      // app.balances.increase(senderId, market.currency, amount)
      app.sdb.increase('Account', { kmc: Number(amount)}, { address: senderId })
    } else {
      if (market.initiator !== senderId) return 'Have no valid shares of correct choice in this market!'
      initiator = 1
      amount = bankerProfit
      app.logger.debug('----------- settle, initiator user without shares amount', amount)

      app.sdb.create('Settle', {
        mid: mid,
        tid: this.trs.id,
        address: senderId,
        amount: amount,
        share: 0
      })
      // app.balances.increase(senderId, market.currency, amount)
      app.sdb.increase('Account', { kmc: Number(amount)}, { address: senderId })
    }
  },
  reveal: async function (mid, choice) {
    let market = await app.sdb.findOne('Market', { condition: { id: mid } })
    if (!market) return 'Market not found'
    if (this.trs.senderId !== market.initiator) return 'Permission denied'
    if (modules.blocks.getLastBlock().timestamp <= market.endTimestamp) return 'Time not arrived'
    // if (this.block.height > market.endHeight + app.config.revealBlockPeriod) return 'Out of date'
    if (market.state !== MARKET_STATE.REVEALING) return 'Incorrect market state'

    app.sdb.create('Reveal', {
      mid: mid,
      tid: this.trs.id,
      choice: choice,
      height: this.lastBlock.height
    })
    app.sdb.update('Market', { state: MARKET_STATE.ANNOUNCING }, { id: mid })
    app.sdb.update('Market', { revealHeight: this.lastBlock.height }, { id: mid })
    app.sdb.update('Market', { revealChoice: choice }, { id: mid })
  },
  appeal: async function (mid, content, amount) {
    let market = await app.sdb.findOne('Market', { condition: { id: mid } })
    if (!market) return 'Market not found'

    app.sdb.create('Appeal', {
      mid: mid,
      tid: this.trs.id,
      appealer: this.trs.senderId,
      content: content,
      amount: amount
    })
  },
  verdict: async function (mid, choice, signatures) {
    let market = await app.sdb.findOne('Market', { condition: { id: mid } })
    if (!market) return 'Market not found'
    if (market.state === MARKET_STATE.FINISHED) return 'Market is already finished'

    let buffer = new ByteBuffer(1, true)
    buffer.writeInt(1007)
    buffer.writeString(mid)
    buffer.writeInt(choice)
    buffer.flip()

    let keysigs = signatures.split(',')
    let publicKeys = []
    let sigs = []
    for (let ks of keysigs) {
      if (ks.length !== 192) return 'Invalid public key or signature'
      publicKeys.push(ks.substr(0, 64))
      sigs.push(ks.substr(64, 192))
    }
    let uniqPublicKeySet = new Set()
    for (let pk of publicKeys) {
      uniqPublicKeySet.add(pk)
    }
    if (uniqPublicKeySet.size !== publicKeys.length) return 'Duplicated public key'

    let sigCount = 0
    for (let i = 0; i < publicKeys.length; ++i) {
      let pk = publicKeys[i]
      let sig = sigs[i]
      if (app.meta.delegates.indexOf(pk) !== -1 && app.verifyBytes(buffer.toBuffer(), pk, sig)) {
        sigCount++
      }
    }
    if (sigCount < Math.floor(app.meta.delegates.length / 2) + 1) return 'Signatures not enough'

    app.sdb.create('Verdict', {
      mid: mid,
      tid: this.trs.id,
      choice: choice,
      signatures: signatures
    })
    app.sdb.update('Market', { state: MARKET_STATE.FINISHED }, { id: mid })
    app.sdb.update('Market', { verdictChoice: choice }, { id: mid })
  },
  comment: async function (mid, content) {
    let market = await app.sdb.findOne('Market', { condition: { id: mid } })
    if (!market) return 'Market not found'

    app.sdb.create('Comment', {
      mid: mid,
      tid: this.trs.id,
      authorId: this.trs.senderId,
      content: content,
    })
  },
  changeState: async function (mid, state) {
    if (app.meta.delegates.indexOf(this.trs.senderPublicKey) === -1) return 'Permission denied'

    let market = await app.sdb.findOne('Market', { condition: { id: mid } })
    if (!market) return 'Market not found'

    if (state === MARKET_STATE.REVEALING) {
      if (market.state !== MARKET_STATE.ONGOING) return 'State not correct'
      if (modules.blocks.getLastBlock().timestamp < market.endTimestamp) return 'Time not arrived'
    } else if (state === MARKET_STATE.FINISHED) {
      if (market.state !== MARKET_STATE.ANNOUNCING) return 'State not correct'
      if (this.lastBlock.height <= market.revealHeight + app.config.announceBlockPeriod) return 'Time not arrived'
    } else {
      return 'Invalid state'
    }
    app.sdb.update('Market', { state: state }, { id: mid })
  }
}
