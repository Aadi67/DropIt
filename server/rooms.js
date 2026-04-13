const rooms = {}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function initRooms(socket, io) {

  // User clicks "Open Room" — server generates code and sends it back
  socket.on('create-room', () => {
    let code = generateCode()
    while (rooms[code]) code = generateCode()

    rooms[code] = {
      host:    socket.id,
      peer:    null,
      created: Date.now()
    }

    socket.join(code)
    socket.roomCode = code

    console.log(`room created: ${code} by ${socket.id}`)

    // Send code back to frontend — frontend shows THIS code
    socket.emit('room-created', { code })
  })

  // User joins with a code
  socket.on('join-room', ({ code }) => {
    const room = rooms[code]

    if (!room) {
      socket.emit('join-error', { message: 'room not found. check your code.' })
      return
    }
    if (room.peer) {
      socket.emit('join-error', { message: 'room is full.' })
      return
    }

    room.peer = socket.id
    socket.join(code)
    socket.roomCode = code

    console.log(`room joined: ${code} by ${socket.id}`)

    socket.emit('room-joined', { code })
    socket.to(code).emit('peer-connected', { peerId: socket.id })
  })

  // Clean up on disconnect
  socket.on('disconnect', () => {
    const code = socket.roomCode
    if (!code || !rooms[code]) return
    delete rooms[code]
    socket.to(code).emit('peer-disconnected')
    console.log(`room closed: ${code}`)
  })
}

module.exports = { initRooms }