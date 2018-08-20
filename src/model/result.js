module.exports = {
  table: 'results',
  memory: true,
  tableFields: [
    {
      name: 'mid',
      type: 'String',
      length: 32,
      not_null: true,
      index: true,
      composite_key: true
    },
    {
      name: 'choice',
      type: 'Number',
      not_null: true,
      index: true,
      composite_key: true
    },
    {
      name: 'desc',
      type: 'String',
      length: 256,
      not_null: true
    },
    {
      name: 'share',
      type: 'BigInt',
      default: 0
    },
    {
      name: 'tradingTimes',
      type: 'Number',
      default: 0
    }
  ]
}
