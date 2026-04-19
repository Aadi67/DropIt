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

function formatSize(bytes) {
  if (bytes < 1024)    return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function escapeHtml(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Landing — Create Room ───────────────────────────────────

$('btn-open-room').addEventListener('click', () => {
  $('btn-open-room').textContent = 'creating...'
  $('btn-open-room').disabled = true
  socket.emit('create-room')
  isHost = true
})

socket.on('room-created', ({ code }) => {
  currentCode = code
  $('room-code-display').textContent = code
  $('create-hint').textContent = 'share this code with the other person'
  $('btn-copy-code').style.display = 'block'
  $('btn-copy-code').addEventListener('click', () => copyToClipboard(code))
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
  $('btn-copy-active').addEventListener('click', () => copyToClipboard(code))
  showScreen('room')

  if (!isHost) {
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
  if (!text)        { showToast('type something first'); return }
  if (!connected)   { showToast('no peer connected yet'); return }
  if (!currentCode) { showToast('not in a room'); return }

  socket.emit('send-text', { code: currentCode, text })
  addMsg('sent', 'you', escapeHtml(text))
  $('text-input').value = ''
}

socket.on('receive-text', ({ text }) => {
  addMsg('received', 'peer', escapeHtml(text))
})

// ─── Progress bar helpers ────────────────────────────────────

function createProgressMsg(type, label, filename, filesize) {
  const msgId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const div   = document.createElement('div')
  div.className = `msg ${type === 'send' ? 'sent' : 'received'}`
  div.id = msgId
  div.innerHTML = `
    <div class="msg-meta">
      <span class="msg-tag tag-file">file</span>
      <span class="msg-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="msg-content">
      ${label}: <strong>${escapeHtml(filename)}</strong> (${formatSize(filesize)})
    </div>
    <div class="progress-wrap">
      <div class="progress-info">
        <span class="progress-pct">0%</span>
        <span class="progress-status">preparing...</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="fill-${msgId}"></div>
      </div>
      <div class="progress-speed" id="speed-${msgId}">–</div>
    </div>
    <div id="action-${msgId}"></div>
  `
  $('feed').appendChild(div)
  $('feed').scrollTop = $('feed').scrollHeight
  return msgId
}

function updateProgress(msgId, pct, status, speed) {
  const fill  = $(`fill-${msgId}`)
  const div   = $(msgId)
  if (!div) return
  const pctEl = div.querySelector('.progress-pct')
  const stsEl = div.querySelector('.progress-status')
  const spdEl = $(`speed-${msgId}`)
  if (fill)   fill.style.width = pct + '%'
  if (pctEl)  pctEl.textContent = pct + '%'
  if (stsEl)  stsEl.textContent = status
  if (spdEl)  spdEl.textContent = speed || ''
  if (pct >= 100 && fill) fill.classList.add('done')
}

function addDownloadButton(msgId, url, filename) {
  const el = $(`action-${msgId}`)
  if (!el) return
  el.innerHTML = `
    <a href="${url}" target="_blank" download="${escapeHtml(filename)}"
      style="color:var(--accent2);font-size:12px;margin-top:6px;display:inline-block">
      ⬇ download ${escapeHtml(filename)}
    </a>
  `
}

// ─── File transfer — S3 direct upload ───────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB

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
  Array.from(files).forEach(file => {
    if (file.size > MAX_FILE_SIZE) {
      showToast(`${file.name} exceeds 5GB limit`)
      return
    }
    sendFileViaS3(file)
  })
}

function sendFileViaS3(file) {
  const msgId = createProgressMsg('send', 'sending', file.name, file.size)
  updateProgress(msgId, 0, 'requesting upload slot...', '')

  socket.emit('request-upload-url', {
    code:     currentCode,
    filename: file.name,
    filetype: file.type || 'application/octet-stream',
    filesize: file.size
  })

  socket.once('upload-url-ready', async ({ url, fields, key, filename }) => {
    if (filename !== file.name) return

    try {
      const startTime = Date.now()
      const formData  = new FormData()

      Object.entries(fields).forEach(([k, v]) => formData.append(k, v))
      formData.append('file', file)

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
          if (!e.lengthComputable) return
          const pct   = Math.round((e.loaded / e.total) * 100)
          const elapsed = (Date.now() - startTime) / 1000
          const speed = elapsed > 0 ? e.loaded / elapsed : 0
          updateProgress(msgId, pct, `uploading to S3... ${pct}%`, `${formatSize(speed)}/s`)
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`S3 upload failed: ${xhr.status}`))
        })

        xhr.addEventListener('error', () => reject(new Error('Upload failed')))

        xhr.open('POST', url)
        xhr.send(formData)
      })

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const speed   = formatSize(file.size / parseFloat(elapsed))
      updateProgress(msgId, 100, '✓ uploaded', `done in ${elapsed}s — avg ${speed}/s`)

      socket.emit('file-uploaded', {
        code:     currentCode,
        key,
        filename: file.name,
        filesize: file.size
      })

    } catch (err) {
      updateProgress(msgId, 0, `✗ failed: ${err.message}`, '')
    }
  })
}

socket.on('file-sent-confirmed', ({ filename }) => {
  console.log(`confirmed: ${filename} delivered to peer`)
})

socket.on('file-ready', ({ downloadUrl, filename, filesize }) => {
  const msgId = createProgressMsg('recv', 'received', filename, filesize)
  updateProgress(msgId, 100, '✓ ready to download', '')
  addDownloadButton(msgId, downloadUrl, filename)
})

// ─── Image transfer — S3 direct upload ──────────────────────

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

document.addEventListener('paste', (e) => {
  if (!$('screen-room').classList.contains('active')) return
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) sendImages([item.getAsFile()])
  }
})

function sendImages(files) {
  if (!connected) { showToast('no peer connected yet'); return }
  Array.from(files).forEach(sendImageViaS3)
}

function sendImageViaS3(file) {
  const fname = file.name || 'image.png'
  const msgId = createProgressMsg('send', 'sending image', fname, file.size)
  updateProgress(msgId, 0, 'requesting upload slot...', '')

  socket.emit('request-image-url', {
    code:     currentCode,
    filename: fname,
    filetype: file.type || 'image/png',
    filesize: file.size
  })

  socket.once('image-url-ready', async ({ url, fields, key }) => {
    try {
      const startTime = Date.now()
      const formData  = new FormData()

      Object.entries(fields).forEach(([k, v]) => formData.append(k, v))
      formData.append('file', file)

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
          if (!e.lengthComputable) return
          const pct   = Math.round((e.loaded / e.total) * 100)
          const speed = e.loaded / ((Date.now() - startTime) / 1000)
          updateProgress(msgId, pct, `uploading... ${pct}%`, `${formatSize(speed)}/s`)
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed: ${xhr.status}`))
        })

        xhr.addEventListener('error', () => reject(new Error('Upload failed')))

        xhr.open('POST', url)
        xhr.send(formData)
      })

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      updateProgress(msgId, 100, '✓ uploaded', `done in ${elapsed}s`)

      socket.emit('image-uploaded', {
        code:     currentCode,
        key,
        filename: fname
      })

    } catch (err) {
      updateProgress(msgId, 0, `✗ failed: ${err.message}`, '')
    }
  })
}

socket.on('image-ready', ({ downloadUrl, filename }) => {
  const feed = $('feed')
  const div  = document.createElement('div')
  div.className = 'msg received'
  div.innerHTML = `
    <div class="msg-meta">
      <span class="msg-tag tag-img">image</span>
      <span class="msg-time">${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="msg-content">received: ${escapeHtml(filename)}</div>
    <img src="${downloadUrl}" class="msg-img" alt="${escapeHtml(filename)}">
    <div style="margin-top:6px">
      <a href="${downloadUrl}" download="${escapeHtml(filename)}"
        style="color:var(--accent2);font-size:12px">
        ⬇ download ${escapeHtml(filename)}
      </a>
    </div>
  `
  feed.appendChild(div)
  feed.scrollTop = feed.scrollHeight
})