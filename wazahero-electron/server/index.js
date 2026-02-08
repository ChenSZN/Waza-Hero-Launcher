const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Store connected users online
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    socket.on('identify', (userData) => {
        onlineUsers.set(socket.id, userData);
        console.log(`User identified: ${userData.username} (${userData.discordId})`);

        // Broadcast that someone is online (optional)
        socket.broadcast.emit('user_online', userData);
    });

    socket.on('activity', (data) => {
        // Broadcast the specific activity to everyone else
        console.log(`Activity from ${data.user}: ${data.action} -> ${data.target}`);
        socket.broadcast.emit('global_activity', data);
    });

    socket.on('disconnect', () => {
        const user = onlineUsers.get(socket.id);
        if (user) {
            console.log(`User disconnected: ${user.username}`);
            onlineUsers.delete(socket.id);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Waza Link Server running on port ${PORT}`);
});
