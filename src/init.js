let constants = require('./lib/constants')

// async function changeToRevealing(params) {
//   let ongoingMarkets = await app.sdb.findAll('Market', {
//     condition: {
//       state: constants.MARKET_STATE.ONGOING,
//       endTimestamp: {
//         $lt: params.slotTime
//       }
//     },
//     sort: { endTimestamp: 1 },
//     limit: 100
//   })
//   app.logger.info('find %d ongoing markets', ongoingMarkets.length)
//   if (!ongoingMarkets.length) return

//   let csTransactions = ongoingMarkets.map((m) => {
//     return params.signTransaction({
//       type: 1007,
//       fee: '0',
//       args: JSON.stringify([m.id, constants.MARKET_STATE.REVEALING])
//     })
//   })
//   await params.addTransactions(csTransactions)
// }

// async function changeAnnouncingToFinished(params) {
//   let announcingMarkets = await app.sdb.findAll('Market', {
//     condition: {
//       state: constants.MARKET_STATE.ANNOUNCING,
//       revealHeight: {
//         $lt: params.height - app.config.announceBlockPeriod - 1
//       }
//     },
//     sort: { revealHeight: 1 },
//     limit: 100
//   })
//   app.logger.info('find %d announcing markets', announcingMarkets.length)
//   if (!announcingMarkets.length) return

//   let csTransactions = announcingMarkets.map((m) => {
//     return params.signTransaction({
//       type: 1007,
//       fee: '0',
//       args: JSON.stringify([m.id, constants.MARKET_STATE.FINISHED])
//     })
//   })
//   await params.addTransactions(csTransactions)
// }

// async function changeMarketState(params) {
//   await changeToRevealing(params)
//   await changeAnnouncingToFinished(params)
// }

module.exports = async function () {
  app.registerContract(1000, 'koumei.createMarket')
  app.registerContract(1001, 'koumei.trade')
  app.registerContract(1002, 'koumei.settle')
  app.registerContract(1003, 'koumei.reveal')
  app.registerContract(1004, 'koumei.appeal')
  app.registerContract(1005, 'koumei.verdict')
  app.registerContract(1006, 'koumei.comment')
  app.registerContract(1007, 'koumei.changeState')

  // app.setDefaultFee('10000000', 'koumei.KMC')
  // app.registerFee(1007, '0')

  // await app.sdb.load('Market', ['state', 'revealHeight', 'revealChoice', 'total', 'id'], ['id'])
  // await app.sdb.load('Share', ['share', 'mid', 'address', 'choice'], [['mid', 'address', 'choice']])
  // await app.sdb.load('Result', ['share', 'mid', 'choice', 'desc'], [['mid', 'choice']])

  // app.registerHook('beforeCreateBlock', changeMarketState)

}
