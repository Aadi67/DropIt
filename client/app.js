const BACKEND_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://dropit-production-c17a.up.railway.app'

const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling']
})

let currentCode = null
let connected   = false
let isHost      = false

// ─── Utility ────────────────────────────────────────────────
function $(id) { return document.getElementById(id) }

function showToast(msg) {
  let t = $('toast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'toast'
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2000)
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

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
  showToast('code copied!')
}

// ─── Landing — Create Room ───────────────────────────────────

// User clicks Open Room → ask SERVER for a code
$('btn-open-room').addEventListener('click', () => {
  $('btn-open-room').textContent = 'creating...'
  $('btn-open-room').disabled = true
  socket.emit('create-room')
  isHost = true
})

// Server responds with confirmed code → show it
socket.on('room-created', ({ code }) => {
  currentCode = code

  // Show the real server-confirmed code
  $('room-code-display').textContent = code
  $('create-hint').textContent = 'share this code with the other person'

  // Show copy button now that we have a real code
  $('btn-copy-code').style.display = 'block'
  $('btn-copy-code').addEventListener('click', () => copyToClipboard(code))

  // Move to room screen
  enterRoom(code)
  addMsg('system', 'sys', `room <strong>${code}</strong> created. share this code and wait for peer.`)
})

// ─── Landing — Join Room ─────────────────────────────────────

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
  isHost = false
})

socket.on('room-joined', ({ code }) => {
  currentCode = code
  enterRoom(code)
  addMsg('system', 'sys', `joined room <strong>${code}</strong>. connecting to peer...`)
})

socket.on('join-error', ({ message }) => {
  showToast(message)
  $('btn-join').disabled = false
})

// ─── Peer connection events ──────────────────────────────────

socket.on('peer-connected', () => {
  setPeerConnected()
  addMsg('system', 'sys', 'peer connected. both sides can send and receive.')
})

socket.on('peer-disconnected', () => {
  connected = false
  $('peer-status').textContent = 'peer disconnected'
  $('peer-status').className = 'peer-status waiting'
  $('conn-banner').classList.add('hidden')
  addMsg('system', 'sys', 'peer left the room.')
})

// ─── Enter room screen ───────────────────────────────────────

function enterRoom(code) {
  $('active-code').textContent = code

  // Copy button in the room bar
  $('btn-copy-active').addEventListener('click', () => copyToClipboard(code))

  showScreen('room')

  // If host — they're already in, peer hasn't joined yet
  // If joiner — peer-connected fires on host side, room-joined fires here
  // So we manually tell host that peer is now connected
  if (!isHost) {
    // Joiner sees their own "connected" state immediately
    // because server fires peer-connected to HOST, room-joined to PEER
    // We trigger connected state for joiner after a tick
    setTimeout(() => {
      setPeerConnected()
      addMsg('system', 'sys', 'connected to peer. both sides can send and receive.')
    }, 300)
  }
}

function setPeerConnected() {
  connected = true
  $('peer-status').textContent = '1 peer connected'
  $('peer-status').className = 'peer-status connected'
  $('conn-banner').classList.remove('hidden')
}

// ─── Leave ───────────────────────────────────────────────────

$('btn-leave').addEventListener('click', () => location.reload())

// ─── Tabs ────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
    tab.classList.add('active')
    $(`panel-${tab.dataset.tab}`).classList.add('active')
  })
})

// ─── Text transfer — BOTH directions ────────────────────────

$('btn-send-text').addEventListener('click', sendText)

$('text-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendText()
  }
})

function sendText() {
  const text = $('text-input').value.trim()
  if (!text)      { showToast('type something first'); return }
  if (!connected) { showToast('no peer connected yet'); return }
  if (!currentCode) { showToast('not in a room'); return }

  socket.emit('send-text', { code: currentCode, text })
  addMsg('sent', 'you', escapeHtml(text))
  $('text-input').value = ''
}

// Receive text — works for BOTH host and peer
socket.on('receive-text', ({ text }) => {
  addMsg('received', 'peer', escapeHtml(text))
})

// ─── File transfer — BOTH directions ────────────────────────

const CHUNK_SIZE = 64 * 1024

$('file-drop').addEventListener('click', () => $('file-input').click())
$('file-input').addEventListener('change', (e) => sendFiles(e.target.files))

$('file-drop').addEventListener('dragover',  (e) => { e.preventDefault(); $('file-drop').classList.add('over') })
$('file-drop').addEventListener('dragleave', ()  => $('file-drop').classList.remove('over'))
$('file-drop').addEventListener('drop', (e) => {
  e.preventDefault()
  $('file-drop').classList.remove('over')
  sendFiles(e.dataTransfer.files)
})

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

function sendFiles(files) {
  if (!connected) { showToast('no peer connected yet'); return }
  Array.from(files).forEach(file => {
    if (file.size > MAX_FILE_SIZE) {
      showToast(`${file.name} exceeds 100MB limit`)
      addMsg('system', 'sys',
        `⚠ ${escapeHtml(file.name)} (${formatSize(file.size)}) exceeds the 100MB limit. skipped.`)
      return
    }
    sendFile(file)
  })
}

function sendFile(file) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  let chunkIndex    = 0
  let startTime     = Date.now()
  const reader      = new FileReader()

  // Create the message with progress bar
  const msgId   = `file-${Date.now()}-${file.name.replace(/\W/g,'')}`
  const feedDiv = document.createElement('div')
  feedDiv.className = 'msg sent'
  feedDiv.id = msgId
  feedDiv.innerHTML = `
    <div class="msg-meta">
      <span class="msg-tag tag-file">file</span>
      <span class="msg-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="msg-content">
      sending: <strong>${escapeHtml(file.name)}</strong> (${formatSize(file.size)})
    </div>
    <div class="progress-wrap">
      <div class="progress-info">
        <span class="progress-pct">0%</span>
        <span class="progress-chunks">0 / ${totalChunks} chunks</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="fill-${msgId}"></div>
      </div>
      <div class="progress-speed" id="speed-${msgId}">calculating...</div>
    </div>
  `
  $('feed').appendChild(feedDiv)
  $('feed').scrollTop = $('feed').scrollHeight

  function updateSenderProgress() {
    const pct      = Math.round((chunkIndex / totalChunks) * 100)
    const elapsed  = (Date.now() - startTime) / 1000
    const bytesSent = chunkIndex * CHUNK_SIZE
    const speed    = elapsed > 0 ? bytesSent / elapsed : 0

    const fill   = $(`fill-${msgId}`)
    const pctEl  = feedDiv.querySelector('.progress-pct')
    const chnkEl = feedDiv.querySelector('.progress-chunks')
    const spdEl  = $(`speed-${msgId}`)

    if (fill)   fill.style.width = pct + '%'
    if (pctEl)  pctEl.textContent = pct + '%'
    if (chnkEl) chnkEl.textContent = `${chunkIndex} / ${totalChunks} chunks`
    if (spdEl)  spdEl.textContent = `${formatSize(speed)}/s`

    // When done
    if (chunkIndex === totalChunks) {
      if (fill)  fill.classList.add('done')
      if (pctEl) pctEl.textContent = '100%'
      if (spdEl) spdEl.textContent = `✓ done in ${elapsed.toFixed(1)}s — avg ${formatSize(bytesSent / elapsed)}/s`
    }
  }

  function readNextChunk() {
    const start = chunkIndex * CHUNK_SIZE
    const blob  = file.slice(start, start + CHUNK_SIZE)
    reader.readAsArrayBuffer(blob)
  }

  reader.onload = (e) => {
    socket.emit('send-file-chunk', {
      code: currentCode,
      chunk: e.target.result,
      filename: file.name,
      filesize: file.size,
      chunkIndex,
      totalChunks
    })
    chunkIndex++
    updateSenderProgress()
    if (chunkIndex < totalChunks) readNextChunk()
  }

  readNextChunk()
}

// ── Receive file chunks with progress bar ──────────────────
const incomingFiles = {}

socket.on('receive-file-chunk', ({ chunk, filename, filesize, chunkIndex, totalChunks }) => {

  // First chunk — create the message with progress bar
  if (!incomingFiles[filename]) {
    incomingFiles[filename] = {
      chunks:    [],
      received:  0,
      total:     totalChunks,
      startTime: Date.now(),
      msgId:     `recv-${Date.now()}-${filename.replace(/\W/g,'')}`
    }

    const f       = incomingFiles[filename]
    const feedDiv = document.createElement('div')
    feedDiv.className = 'msg received'
    feedDiv.id = f.msgId
    feedDiv.innerHTML = `
      <div class="msg-meta">
        <span class="msg-tag tag-file">file</span>
        <span class="msg-time">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="msg-content">
        receiving: <strong>${escapeHtml(filename)}</strong> (${formatSize(filesize)})
      </div>
      <div class="progress-wrap">
        <div class="progress-info">
          <span class="progress-pct">0%</span>
          <span class="progress-chunks">0 / ${totalChunks} chunks</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" id="fill-${f.msgId}"></div>
        </div>
        <div class="progress-speed" id="speed-${f.msgId}">waiting for data...</div>
      </div>
    `
    $('feed').appendChild(feedDiv)
    $('feed').scrollTop = $('feed').scrollHeight
  }

  const f = incomingFiles[filename]
  f.chunks[chunkIndex] = chunk
  f.received++

  // Update receiver progress bar
  const pct     = Math.round((f.received / f.total) * 100)
  const elapsed = (Date.now() - f.startTime) / 1000
  const bytesRx = f.received * CHUNK_SIZE
  const speed   = elapsed > 0 ? bytesRx / elapsed : 0

  const fill   = $(`fill-${f.msgId}`)
  const feedDiv = $(f.msgId)
  const pctEl  = feedDiv ? feedDiv.querySelector('.progress-pct')    : null
  const chnkEl = feedDiv ? feedDiv.querySelector('.progress-chunks') : null
  const spdEl  = $(`speed-${f.msgId}`)

  if (fill)   fill.style.width = pct + '%'
  if (pctEl)  pctEl.textContent = pct + '%'
  if (chnkEl) chnkEl.textContent = `${f.received} / ${f.total} chunks`
  if (spdEl)  spdEl.textContent = `${formatSize(speed)}/s`

  // All chunks received — assemble and offer download
  if (f.received === f.total) {
    const blob = new Blob(f.chunks.map(c => new Uint8Array(c)))
    const url  = URL.createObjectURL(blob)

    if (fill)  fill.classList.add('done')
    if (pctEl) pctEl.textContent = '100%'
    if (spdEl) spdEl.textContent = `✓ done in ${elapsed.toFixed(1)}s — avg ${formatSize(bytesRx / elapsed)}/s`

    // Append download link to the same message
    if (feedDiv) {
      const dl = document.createElement('div')
      dl.style.marginTop = '8px'
      dl.innerHTML = `
        <a href="${url}" download="${filename}"
          style="color:var(--accent2);font-size:12px">
          ⬇ download ${escapeHtml(filename)}
        </a>
      `
      feedDiv.appendChild(dl)
      $('feed').scrollTop = $('feed').scrollHeight
    }

    delete incomingFiles[filename]
  }
})

// ─── Image transfer — BOTH directions ───────────────────────

$('img-drop').addEventListener('click', () => $('img-input').click())
$('img-input').addEventListener('change', (e) => sendImages(e.target.files))

$('img-drop').addEventListener('dragover',  (e) => { e.preventDefault(); $('img-drop').classList.add('over') })
$('img-drop').addEventListener('dragleave', ()  => $('img-drop').classList.remove('over'))
$('img-drop').addEventListener('drop', (e) => {
  e.preventDefault()
  $('img-drop').classList.remove('over')
  sendImages(e.dataTransfer.files)
})

document.addEventListener('paste', (e) => {
  if (!$('screen-room').classList.contains('active')) return
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) sendImages([item.getAsFile()])
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
    addMsg('sent', 'img', `sent: ${file.name}`,
      `<img src="${e.target.result}" class="msg-img" alt="${file.name}">
       <div style="margin-top:6px">
         <a href="${e.target.result}" download="${file.name}"
           style="color:var(--accent2);font-size:12px">
           ⬇ download ${file.name}
         </a>
       </div>`)
  }
  reader.readAsDataURL(file)
}

// Receive image — works for BOTH directions
socket.on('receive-image', ({ imageData, filename }) => {
  addMsg('received', 'img', `received: ${filename}`,
    `<img src="${imageData}" class="msg-img" alt="${filename}">
     <div style="margin-top:6px">
       <a href="${imageData}" download="${filename}"
         style="color:var(--accent2);font-size:12px">
         ⬇ download ${filename}
       </a>
     </div>`)
})

// ─── Helpers ─────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes < 1024)    return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}