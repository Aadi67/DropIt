const { createClient } = require('redis')

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
})

client.on('error', (err) => {
  console.error('Redis error:', err)
})

client.on('connect', () => {
  console.log('Redis connected')
})

async function connectRedis() {
  await client.connect()
  return client
}

module.exports = { connectRedis, client }