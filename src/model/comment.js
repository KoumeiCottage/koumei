module.exports = {
  table: 'comments',
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
      name: 'authorId',
      type: 'String',
      length: 50,
      not_null: true
    },
    {
      name: 'content',
      type: 'Text',
      length: 1024,
      not_null: true
    }
  ]
}
