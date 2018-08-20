module.exports = {
  table: 'verdicts',
  tableFields: [
    {
      name: 'mid',
      type: 'String',
      length: 32,
      not_null: true,
      primary_key: true
    },
    {
      name: 'tid',
      type: 'String',
      length: 64,
      not_null: true,
      unique: true
    },
    {
      name: 'choice',
      type: 'Number',
      not_null: true
    },
    {
      name: 'signatures',
      type: 'Text'
    }
  ]
}
