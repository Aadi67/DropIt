require('dotenv').config()

const express    = require('express')
const http       = require('http')
const { Server } = require('socket.io')
const path       = require('path')

const { initRooms }    = require('./rooms')
const { initTransfer } = require('./transfer')

const app    = express()
const server = http.createServer(app)
const io     = new Server(server)

const PORT = process.env.PORT || 3000

// Serve your frontend files from the client folder
app.use(express.static(path.join(__dirname, '../client')))

// Health check — lets you confirm server is alive
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// Wire up socket logic
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