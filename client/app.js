const socket = io()

let currentCode = null
let connected   = false

// ─── Utility ────────────────────────────────────────────────
function $(id) { return document.getElementById(id) }

function showToast(msg) {
  const t = $('toast') || createToast()
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2000)
}

function createToast() {
  const t = document.createElement('div')
  t.id = 'toast'
  document.body.appendChild(t)
  return t
}

function addMsg(type, tag, content, extra = '') {
  const feed = $('feed')
  const div  = document.createElement('div')
  div.className = `msg ${type}`
  div.innerHTML = `
    <div class="msg-meta">
      <span class="msg-tag tag-${tag}">${tag}</span>
      <span class="msg-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="msg-content">${content}</div>
    ${extra}
  `
  feed.appendChild(div)
  feed.scrollTop = feed.scrollHeight
}

function showScreen(name) {
  document.querySelectorAll('.screen')
    .forEach(s => s.classList.remove('active'))
  $(`screen-${name}`).classList.add('active')
}

// ─── Landing screen ─────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++)
    code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

$('btn-generate').addEventListener('click', () => {
  const code = generateCode()
  $('room-code-display').textContent = code
  currentCode = code
})

$('btn-copy-code').addEventListener('click', () => {
  if (!currentCode) return
  navigator.clipboard.writeText(currentCode)
  showToast('code copied!')
})

$('btn-open-room').addEventListener('click', () => {
  if (!currentCode) {
    showToast('generate a code first')
    return
  }
  socket.emit('create-room')
})

$('join-input').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase()
})

$('btn-join').addEventListener('click', () => {
  const code = $('join-input').value.trim().toUpperCase()
  if (code.length !== 4) {
    showToast('enter a 4-character code')
    return
  }
  socket.emit('join-room', { code })
})

// ─── Socket — room events ────────────────────────────────────
socket.on('room-created', ({ code }) => {
  currentCode = code
  $('room-code-display').textContent = code
  enterRoom(code)
  addMsg('system', 'sys', 'room created. waiting for peer to join...')
})

socket.on('room-joined', ({ code }) => {
  currentCode = code
  enterRoom(code)
  addMsg('system', 'sys', 'joined room. connecting to peer...')
})

socket.on('join-error', ({ message }) => {
  showToast(message)
})

socket.on('peer-connected', () => {
  setPeerConnected()
  addMsg('system', 'sys', 'peer connected. ready to transfer.')
})

socket.on('peer-disconnected', () => {
  $('peer-status').textContent = 'peer disconnected'
  $('peer-status').className = 'peer-status waiting'
  $('conn-banner').classList.add('hidden')
  connected = false
  addMsg('system', 'sys', 'peer left the room.')
})

function enterRoom(code) {
  $('active-code').textContent = code
  showScreen('room')
}

function setPeerConnected() {
  connected = true
  $('peer-status').textContent = '1 peer connected'
  $('peer-status').className = 'peer-status connected'
  $('conn-banner').classList.remove('hidden')
}

// ─── Leave room ──────────────────────────────────────────────
$('btn-leave').addEventListener('click', () => {
  location.reload()
})

// ─── Tabs ────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab')
      .forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.panel')
      .forEach(p => p.classList.remove('active'))
    tab.classList.add('active')
    $(`panel-${tab.dataset.tab}`).classList.add('active')
  })
})

// ─── Text transfer ───────────────────────────────────────────
$('btn-send-text').addEventListener('click', sendText)

$('text-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendText()
  }
})

function sendText() {
  const text = $('text-input').value.trim()
  if (!text) return
  if (!connected) { showToast('no peer connected yet'); return }

  socket.emit('send-text', { code: currentCode, text })
  addMsg('sent', 'you', text.replace(/</g, '&lt;'))
  $('text-input').value = ''
}

socket.on('receive-text', ({ text }) => {
  addMsg('received', 'peer', text.replace(/</g, '&lt;'))
})

// ─── File transfer ───────────────────────────────────────────
const CHUNK_SIZE = 64 * 1024 // 64KB chunks

$('file-drop').addEventListener('click', () => $('file-input').click())
$('file-input').addEventListener('change', (e) => sendFiles(e.target.files))

$('file-drop').addEventListener('dragover', (e) => {
  e.preventDefault()
  $('file-drop').classList.add('over')
})
$('file-drop').addEventListener('dragleave', () => {
  $('file-drop').classList.remove('over')
})
$('file-drop').addEventListener('drop', (e) => {
  e.preventDefault()
  $('file-drop').classList.remove('over')
  sendFiles(e.dataTransfer.files)
})

function sendFiles(files) {
  if (!connected) { showToast('no peer connected yet'); return }
  Array.from(files).forEach(sendFile)
}

function sendFile(file) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  let chunkIndex = 0
  const reader = new FileReader()

  addMsg('sent', 'file', `sending: <strong>${file.name}</strong> (${formatSize(file.size)})`)

  function readNextChunk() {
    const start = chunkIndex * CHUNK_SIZE
    const end   = Math.min(start + CHUNK_SIZE, file.size)
    const blob  = file.slice(start, end)
    reader.readAsArrayBuffer(blob)
  }

  reader.onload = (e) => {
    socket.emit('send-file-chunk', {
      code:        currentCode,
      chunk:       e.target.result,
      filename:    file.name,
      filesize:    file.size,
      chunkIndex,
      totalChunks
    })
    chunkIndex++
    if (chunkIndex < totalChunks) readNextChunk()
    else addMsg('sent', 'sys', `✓ ${file.name} sent completely`)
  }

  readNextChunk()
}

// Receive file chunks and reassemble
const incomingFiles = {}

socket.on('receive-file-chunk', ({ chunk, filename, filesize, chunkIndex, totalChunks }) => {
  if (!incomingFiles[filename]) {
    incomingFiles[filename] = { chunks: [], received: 0, total: totalChunks }
    addMsg('received', 'file', `receiving: <strong>${filename}</strong> (${formatSize(filesize)})`)
  }

  const file = incomingFiles[filename]
  file.chunks[chunkIndex] = chunk
  file.received++

  if (file.received === file.total) {
    const blob = new Blob(file.chunks.map(c => new Uint8Array(c)))
    const url  = URL.createObjectURL(blob)
    const link = `<a href="${url}" download="${filename}"
      style="color:var(--accent2)">⬇ download ${filename}</a>`
    addMsg('received', 'sys', `✓ ${filename} ready — ${link}`)
    delete incomingFiles[filename]
  }
})

// ─── Image transfer ──────────────────────────────────────────
$('img-drop').addEventListener('click', () => $('img-input').click())
$('img-input').addEventListener('change', (e) => sendImages(e.target.files))

$('img-drop').addEventListener('dragover', (e) => {
  e.preventDefault()
  $('img-drop').classList.add('over')
})
$('img-drop').addEventListener('dragleave', () => {
  $('img-drop').classList.remove('over')
})
$('img-drop').addEventListener('drop', (e) => {
  e.preventDefault()
  $('img-drop').classList.remove('over')
  sendImages(e.dataTransfer.files)
})

// Paste image from clipboard
document.addEventListener('paste', (e) => {
  const items = e.clipboardData.items
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      sendImages([item.getAsFile()])
    }
  }
})

function sendImages(files) {
  if (!connected) { showToast('no peer connected yet'); return }
  Array.from(files).forEach(sendImage)
}

function sendImage(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    socket.emit('send-image', {
      code:      currentCode,
      imageData: e.target.result,
      filename:  file.name
    })
    addMsg('sent', 'img',
      `sent image: ${file.name}`,
      `<img src="${e.target.result}" class="msg-img" alt="${file.name}">`)
  }
  reader.readAsDataURL(file)
}

socket.on('receive-image', ({ imageData, filename }) => {
  addMsg('received', 'img',
    `received image: ${filename}`,
    `<img src="${imageData}" class="msg-img" alt="${filename}">`)
})

// ─── Helpers ─────────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes < 1024)        return bytes + ' B'
  if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}