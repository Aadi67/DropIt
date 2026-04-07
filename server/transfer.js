function initTransfer(socket, io) {

  // Text message transfer
  socket.on('send-text', ({ code, text }) => {
    if (!code) return
    console.log(`text transfer in room: ${code}`)
    socket.to(code).emit('receive-text', { text })
  })

  // File transfer — sends as chunks
  socket.on('send-file-chunk', ({ code, chunk, filename, filesize, chunkIndex, totalChunks }) => {
    if (!code) return
    socket.to(code).emit('receive-file-chunk', {
      chunk,
      filename,
      filesize,
      chunkIndex,
      totalChunks
    })
  })

  // Image transfer
  socket.on('send-image', ({ code, imageData, filename }) => {
    if (!code) return
    console.log(`image transfer in room: ${code}`)
    socket.to(code).emit('receive-image', { imageData, filename })
  })

}

module.exports = { initTransfer }