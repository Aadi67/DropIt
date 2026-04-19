const { getUploadUrl, getDownloadUrl } = require('./s3')

function initTransfer(socket, io) {

  // ── Text transfer (unchanged) ──────────────────────────────
  socket.on('send-text', ({ code, text }) => {
    if (!code) return
    socket.to(code).emit('receive-text', { text })
  })

  // ── S3 presigned upload URL request ───────────────────────
  socket.on('request-upload-url', async ({ code, filename, filetype, filesize }) => {
    if (!code) return
    try {
      const { url, fields, key } = await getUploadUrl(filename, filetype, filesize)
      // Send presigned URL back only to requester
      socket.emit('upload-url-ready', { url, fields, key, filename, filesize })
    } catch (err) {
      console.error('S3 presign error:', err)
      socket.emit('upload-error', { message: 'Could not generate upload URL' })
    }
  })

  // ── Notify peer that file is uploaded and ready ────────────
  socket.on('file-uploaded', async ({ code, key, filename, filesize }) => {
    if (!code) return
    try {
      const downloadUrl = await getDownloadUrl(key)
      // Tell the other peer the file is ready to download
      socket.to(code).emit('file-ready', { downloadUrl, filename, filesize })
      // Also confirm to sender
      socket.emit('file-sent-confirmed', { filename })
    } catch (err) {
      console.error('S3 download URL error:', err)
    }
  })

  // ── Image transfer (via S3 same as files) ─────────────────
  socket.on('request-image-url', async ({ code, filename, filetype, filesize }) => {
    if (!code) return
    try {
      const { url, fields, key } = await getUploadUrl(filename, filetype, filesize)
      socket.emit('image-url-ready', { url, fields, key, filename, filesize })
    } catch (err) {
      socket.emit('upload-error', { message: 'Could not generate image upload URL' })
    }
  })

  socket.on('image-uploaded', async ({ code, key, filename }) => {
    if (!code) return
    try {
      const downloadUrl = await getDownloadUrl(key)
      socket.to(code).emit('image-ready', { downloadUrl, filename })
      socket.emit('image-sent-confirmed', { filename })
    } catch (err) {
      console.error('S3 image URL error:', err)
    }
  })

}

module.exports = { initTransfer }