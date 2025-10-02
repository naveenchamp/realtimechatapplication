const express = require('express')
const path = require('path')
const app = express()
const server = require('http').Server(app)
const io = require('socket.io')(server)

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.urlencoded({ extended: true }))

const rooms = { }

app.get('/', (req, res) => {
  res.render('index', { rooms: rooms })
})

app.post('/room', (req, res) => {
  if (rooms[req.body.room] != null) {
    return res.redirect('/')
  }
  rooms[req.body.room] = { users: {} }
  // FIX #1: Emitting the event BEFORE the redirect, so it actually runs.
  io.emit('room-created', req.body.room)
  res.redirect(req.body.room)
})

app.get('/:room', (req, res) => {
  if (rooms[req.params.room] == null) {
    return res.redirect('/')
  }
  res.render('room', { roomName: req.params.room })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

io.on('connection', socket => {
  socket.on('new-user', (room, name) => {
    // FIX #2: Added a check to prevent crashing if the room doesn't exist.
    if (rooms[room]) {
      socket.join(room)
      rooms[room].users[socket.id] = name
      socket.to(room).broadcast.emit('user-connected', name)
    }
  })
  
  socket.on('send-chat-message', (room, message) => {
    // Added a check for robustness to ensure user and room exist.
    if (rooms[room] && rooms[room].users[socket.id]) {
      socket.to(room).broadcast.emit('chat-message', { message: message, name: rooms[room].users[socket.id] })
    }
  })

  socket.on('disconnect', () => {
    getUserRooms(socket).forEach(room => {
      // Added a check to ensure user and room exist before processing.
      if (rooms[room] && rooms[room].users[socket.id]) {
        const userName = rooms[room].users[socket.id]
        socket.to(room).broadcast.emit('user-disconnected', userName)
        delete rooms[room].users[socket.id]

        // Optional but good practice: Clean up empty rooms to save memory.
        if (Object.keys(rooms[room].users).length === 0) {
          delete rooms[room]
          console.log(`Room '${room}' was empty and has been deleted.`)
          // Notify all clients to remove the room from their list
          io.emit('room-deleted', room)
        }
      }
    })
  })
})

function getUserRooms(socket) {
  return Object.entries(rooms).reduce((names, [name, room]) => {
    if (room.users[socket.id] != null) names.push(name)
    return names
  }, [])
}
