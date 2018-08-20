module.exports = {
  table: 'settles',
  tableFields: [
    {
      name: 'mid',
      type: 'String',
      length: 32,
      not_null: true,
      index: true
    },
    {
      name: 'tid',
      type: 'String',
      length: 64,
      primary_key: true
    },
    {
      name: 'address',
      type: 'String',
      length: 50,
      not_null: true
    },
    {
      name: 'amount',
      type: 'String',
      length: 50,
      not_null: true
    },
    {
      name: 'share',
      type: 'BigInt',
      not_null: true
    }
  ]
}
