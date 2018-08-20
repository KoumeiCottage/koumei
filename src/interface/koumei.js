let constants = require('../lib/constants')

const MARKET_STATE = constants.MARKET_STATE

function isDefined(x) {
  return typeof x !== 'undefined'
}

module.exports = (router) => {
  router.get('/markets', async (req) => {
    let query = req.query
    let condition = {}
    if (isDefined(query.currency)) condition.currency = query.currency
    if (isDefined(query.initiator)) condition.initiator = query.initiator
    if (isDefined(query.state)) condition.state = query.state
    if (isDefined(query.tid)) condition.tid = query.tid
    if (isDefined(query.category)) condition.category = query.category

    let count = await app.sdb.count('Market', condition)
    let markets = []
    if (count > 0) {
      markets = await app.sdb.findAll('Market', {
        condition: condition,
        sort: {
          endHeight: 1
        },
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      })

      if (!markets) throw new Error('No existing markets')

      let mids = markets.map((m) => m.id)
      let allResults = await app.sdb.findAll('Result', { condition: { mid: { $in: mids } } })
      for (let m of markets) {
        m.resultDetail = allResults.filter((r) => r.mid === m.id)
      }

      for (let m of markets) {
        let results = m.resultDetail

        // Calculate probability
        let sum = 0
        for (let i of results) {
          app.logger.debug('------------------i.share,market.share', i.share, m.share)
          sum += Math.exp(i.share / m.margin)
        }
        if (sum === Infinity) {
          return 'Invalid sum'
        }
        for (let i of results) {
          i.probability = Math.exp(i.share / m.margin) / sum
          app.logger.debug('------------------i.share,i.probability,sum', i.share, i.probability, sum)
        }
        let biggestShare = Math.max.apply(Math, results.map(function (o) { return o.share; }))
        m.hotResult = results.find((o) => o.share === biggestShare)
        //let sortedResult = results.sort((a, b) => a.share < b.share)
        //m.hotResult = sortedResult[0]

        let finalChoice = (m.verdictChoice === -1) ? m.revealChoice : m.verdictChoice
        m.finalResult = results[finalChoice] || finalChoice
        m.totalShares = results.reduce((acc, result) => acc + result.share, 0)

        m.endTimestamp = app.getRealTime(m.endTimestamp)
      }
      markets.sort((a, b) => a.state < b.state);
    }
    return { markets: markets, count: count }
  })

  router.get('/markets/calc/:margin/:results', async (req) => {
    let margin = req.params.margin
    let results = req.params.results

    results = results.split(',')
    app.validate('array', results, { length: { minimum: 2, maximum: 32 } })
    resultsSet = new Set(results)
    app.logger.debug('-------------', resultsSet, results, results.length, resultsSet.size)
    if (results.length !== resultsSet.size) return { success: false, error: 'There are repetitive answers' }
    let deposit = (margin * (Math.log(results.length).toFixed(constants.MAX_DIGITS_PRECISION)) * Math.pow(10, constants.MAX_DIGITS_PRECISION)).toString()
    return { deposit }
  })

  router.get('/markets/:id', async (req) => {
    let market = await app.sdb.findOne('Market', { condition: { id: req.params.id } })
    if (!market) throw new Error('Market not found')
    let account = await app.sdb.findOne('Account', { condition: { address: market.initiator } })
    market.initiatorNickName = account.str1
    let results = await app.sdb.findAll('Result', { condition: { mid: req.params.id } })
    market.resultsDetail = results
    market.endTimestamp = app.getRealTime(market.endTimestamp)
    return { market: market }
  })

  router.get('/markets/:id/calc', async (req) => {
    let mid = req.params.id
    let choice = Number(req.query.choice)
    let share = Number(req.query.share)
    app.logger.debug('-----------enter calc market mid,choice,share', mid, choice, share)

    let market = await app.sdb.findOne('Market', { condition: { id: mid } })
    if (!market) throw new Error('Market not found')

    let results = await app.sdb.findAll('Result', { condition: { mid: mid } })
    let v1 = 0
    let v2 = 0
    app.logger.debug('-----------calc market info', market.id, market.share, market.margin, market.total)
    for (let i of results) {
      let choiceItem = app.sdb.get('Result', { mid: mid, choice: i.choice })
      let choiceShare = choiceItem.share
      v1 += Math.exp(choiceShare / market.margin)
      if (i.choice === choice) {
        v2 += Math.exp((choiceShare + share) / market.margin)
      } else {
        v2 += Math.exp(choiceShare / market.margin)
      }
      app.logger.debug('-----------calc choice', i.choice, choiceShare, v1, v2)
    }

    if (v1 === Infinity || v2 === Infinity) {
      return 'Insufficient amount'
    }
    // let c1 = (market.margin)*(Math.log(v1))
    // let c2 = (market.margin)*(Math.log(v2))
    // let amount = ((c2 - c1).toFixed(constants.MAX_DIGITS_PRECISION) * Math.pow(10, constants.MAX_DIGITS_PRECISION)).toString()
    const bignum = app.util.bignumber
    let c1 = bignum(market.margin).mul(Math.log(v1).toFixed(constants.MAX_DIGITS_PRECISION))
    let c2 = bignum(market.margin).mul(Math.log(v2).toFixed(constants.MAX_DIGITS_PRECISION))
    let amount = (bignum(c2).sub(c1)).mul(Math.pow(10, constants.MAX_DIGITS_PRECISION)).toString()
    app.logger.debug('-------------calc c1 c2 amount', c1, c2, amount, bignum(market.margin))
    return { mid: mid, choice: choice, share: share, amount: amount }
  })

  router.get('/markets/:id/results', async (req) => {
    let mid = req.params.id
    if (!mid) throw new Error('Invalid params')

    let results = await app.sdb.findAll('Result', {
      condition: {
        mid: mid
      }
    })
    if (req.query.probability) {
      let market = await app.sdb.findOne('Market', {
        condition: {
          id: mid
        }
      })
      if (!market) throw new Error('Market not found')
      let sum = 0
      for (let i of results) {
        app.logger.debug('------------------i.share,market.share', i.share, market.share)
        sum += Math.exp(i.share / market.margin)
      }
      if (sum === Infinity) {
        return 'Invalid sum'
      }
      for (let i of results) {
        i.probability = Math.exp(i.share / market.margin) / sum
        app.logger.debug('------------------i.share,i.probability,sum', i.share, i.probability, sum)
      }
    }
    return { results: results }
  })

  router.get('/markets/:id/trades', async (req) => {
    let condiiton = { mid: req.params.id }
    let count = await app.sdb.count('Trade', condiiton)
    let trades = []
    if (count > 0) {
      trades = await app.sdb.findAll('Trade', {
        condition: {
          mid: req.params.id
        },
        sort: {
          timestamp: -1
        },
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      })
    }
    return { trades: trades, count: count }
  })

  router.get('/markets/:id/settles', async (req) => {
    let condiiton = { mid: req.params.id }
    let count = await app.sdb.count('Settle', condiiton)
    let settles = []
    if (count > 0) {
      settles = await app.sdb.findAll('Settle', {
        condition: condiiton,
        sort: {
          timestamp: -1
        },
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      })
    }
    return { settles: settles, count: count }
  })

  router.get('/markets/:id/appeals', async (req) => {
    let condiiton = { mid: req.params.id }
    let count = await app.sdb.count('Appeal', condiiton)
    let appeals = []
    if (count > 0) {
      appeals = await app.sdb.findAll('Appeal', {
        condition: {
          mid: req.params.id
        },
        sort: {
          timestamp: -1
        },
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      })
    }
    return { appeals: appeals, count: count }
  })

  router.get('/markets/:id/comments', async (req) => {
    let condiiton = { mid: req.params.id }
    let count = await app.sdb.count('Comment', condiiton)
    let comments = []
    if (count > 0) {
      comments = await app.sdb.findAll('Comment', {
        condition: {
          mid: req.params.id
        },
        sort: {
          timestamp: -1
        },
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      })

      let addresses = comments.map((c) => c.authorId)
      let accounts = await app.sdb.findAll('Account', {
        condition: {
          address: { $in: addresses }
        },
        fields: ['str1', 'address']
      })
      let accountMap = new Map
      for (let account of accounts) {
        accountMap.set(account.address, account)
      }
      for (let c of comments) {
        let account = accountMap.get(c.authorId)
        if (account) {
          c.nickname = account.str1
        }
      }
    }
    return { comments: comments, count: count }
  })

  router.get('/markets/:id/reveal', async (req) => {
    let reveal = await app.sdb.findOne('Reveal', {
      condition: {
        mid: req.params.id
      }
    })
    if (!reveal) throw new Error('Reveal not found')
    return { reveal: reveal }
  })

  router.get('/markets/:id/verdict', async (req) => {
    let verdict = await app.sdb.findOne('Verdict', {
      condition: {
        mid: req.params.id
      }
    })
    if (!verdict) throw new Error('Verdict not found')
    return { verdict: verdict }
  })

  router.get('/markets/:id/shares/:address', async (req) => {
    let id = req.params.id
    let address = req.params.address
    let shares = await app.sdb.findAll('Share', {
      condition: {
        mid: id,
        address: address
      }
    })
    return { shares: shares, count: shares.length }
  })

  router.get('/shares/:address', async (req) => {
    let address = req.params.address
    let condition = { address: address }
    let count = await app.sdb.count('Share', condition)
    let shares = []
    if (count > 0) {
      shares = await app.sdb.findAll('Share', {
        condition: condition,
        sort: {
          mid: 1
        },
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      })

      let mids = shares.map((c) => c.mid)
      let markets = await app.sdb.findAll('Market', {
        condition: {
          id: { $in: mids }
        },
        fields: ['title', 'id', 'state', 'desc']
      })
      let marketMap = new Map
      for (let market of markets) {
        marketMap.set(market.id, market)
      }
      for (let c of shares) {
        let market = marketMap.get(c.mid)
        if (market) {
          c.market = market
        }
      }
    }
    return { count: count, shares: shares }
  })

  router.get('/trades/:address', async (req) => {
    let condiiton = { trader: req.params.address }
    let count = await app.sdb.count('Trade', condiiton)
    let trades = []
    if (count > 0) {
      trades = await app.sdb.findAll('Trade', {
        condition: condiiton,
        sort: {
          timestamp: -1
        },
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      })

      let mids = trades.map((c) => c.mid)
      let markets = await app.sdb.findAll('Market', {
        condition: {
          id: { $in: mids }
        },
        fields: ['title', 'id']
      })
      let marketMap = new Map
      for (let market of markets) {
        marketMap.set(market.id, market)
      }
      for (let c of trades) {
        let choiceItem = app.sdb.get('Result', { mid: c.mid, choice: c.choice })
        let market = marketMap.get(c.mid)
        if (market) {
          c.mtitle = market.title
          c.desc = choiceItem.desc
        }
      }
    }
    return { trades: trades, count: count }
  })

  router.get('/settles/:mid/:address', async (req) => {
    let mid = req.params.mid
    let senderId = req.params.address
    let bankerProfit = 0
    let amount = 0
    let initiator = 0

    let market = await app.sdb.findOne('Market', { condition: { id: mid } })
    if (!market) return { success: false, error: 'Market not found' }
    if (market.state < MARKET_STATE.FINISHED) return { success: false, error: 'Market not finished' }

    let correctChoice = market.verdictChoice >= 0 ? market.verdictChoice : market.revealChoice
    if (correctChoice < 0) return { success: false, error: 'Invalid market state or final result' }

    let correctShare = await app.sdb.findOne('Result', { condition: { mid: mid, choice: correctChoice } })
    if (correctShare) {
      bankerProfit = market.total - (correctShare.share * Math.pow(10, constants.MAX_DIGITS_PRECISION))
    } else {
      // correctShare = 0
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
      app.logger.debug('----------------Find shares')
      let settledShare = myShare.share * Math.pow(10, constants.MAX_DIGITS_PRECISION)
      if (market.initiator !== senderId) {
        // normal user
        if (settledShare == 0) return { success: false, error: 'You had been settled in this market already' }
        if (settledShare > 0) {
          amount = settledShare
          app.logger.debug('----------- normal user amount', amount)
        }
      } else {
        initiator = 1
        amount = settledShare + bankerProfit
        app.logger.debug('----------- initiator user with sahres amount', amount)
      }
      return { amount, shares: myShare.share, initiator }
    } else {
      if (market.initiator !== senderId) return { success: false, error: 'Have no valid shares of correct choice in this market!' }
      initiator = 1
      amount = bankerProfit
      app.logger.debug('----------- initiator user without shares amount', amount)
      return { amount, shares: 0, initiator }
    }
  })

}
