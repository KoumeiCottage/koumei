module.exports = {
  table: 'appeals',
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
      name: 'appealer',
      type: 'String',
      length: 50,
      not_null: true
    },
    {
      name: 'content',
      type: 'Text',
      not_null: true
    },
    {
      name: 'amount',
      type: 'String',
      length: 50,
      not_null: true
    }
  ]
}
