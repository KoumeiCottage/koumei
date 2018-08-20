module.exports = {
  table: 'shares',
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
      name: 'address',
      type: 'String',
      length: 50,
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
      name: 'share',
      type: 'BigInt',
      default: 0
    }
  ]
}
