require('dotenv').config()

const express    = require('express')
const http       = require('http')
const { Server } = require('socket.io')
const path       = require('path')

const { initRooms }    = require('./rooms')
const { initTransfer } = require('./transfer')

const app    = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://allindrop.in',
      'https://www.allindrop.in',
      'https://allindrop.pages.dev'
    ],
    methods: ['GET', 'POST']
  }
})

const PORT = process.env.PORT || 3000

app.use(express.static(path.join(__dirname, '../client')))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

io.on('connection', (socket) => {
  console.log(`peer connected: ${socket.id}`)
  initRooms(socket, io)
  initTransfer(socket, io)
  socket.on('disconnect', () => {
    console.log(`peer disconnected: ${socket.id}`)
  })
})

server.listen(PORT, () => {
  console.log(`dropit server running at http://localhost:${PORT}`)
})