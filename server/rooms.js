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

  // User clicks "Create Room"
  socket.on('create-room', () => {
    let code = generateCode()

    // Make sure code is unique
    while (rooms[code]) {
      code = generateCode()
    }

    rooms[code] = {
      host:   socket.id,
      peer:   null,
      created: Date.now()
    }

    socket.join(code)
    socket.roomCode = code

    console.log(`room created: ${code} by ${socket.id}`)
    socket.emit('room-created', { code })
  })

  // User enters a code and clicks "Join"
  socket.on('join-room', ({ code }) => {
    const room = rooms[code]

    if (!room) {
      socket.emit('join-error', { message: 'Room not found. Check your code.' })
      return
    }

    if (room.peer) {
      socket.emit('join-error', { message: 'Room is full.' })
      return
    }

    room.peer = socket.id
    socket.join(code)
    socket.roomCode = code

    console.log(`room joined: ${code} by ${socket.id}`)

    // Tell the joiner they connected
    socket.emit('room-joined', { code })

    // Tell the host their peer arrived
    socket.to(code).emit('peer-connected', { peerId: socket.id })
  })

  // Clean up when someone leaves
  socket.on('disconnect', () => {
    const code = socket.roomCode
    if (!code || !rooms[code]) return

    delete rooms[code]
    socket.to(code).emit('peer-disconnected')
    console.log(`room closed: ${code}`)
  })
}

module.exports = { initRooms }