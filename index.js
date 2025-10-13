import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } } );

let users = {};

io.on("connection", (socket) => {
  
  socket.on("register", ({ userId, fcmToken }) => {

    if (!userId || userId.trim() === "") return;

    const cleanUserId = userId.trim();

    const existingUserId = Object.keys(users).find((key) => users[key].socketId === socket.id);

    if (existingUserId && existingUserId !== cleanUserId) delete users[existingUserId];

    users[cleanUserId] = { socketId: socket.id, fcmToken };

    console.log("registered:", cleanUserId);

    io.emit("users", Object.keys(users));

  });

  socket.on("call", ({ targetUserId, offer }) => {

    const targetUser = users[targetUserId];

    if (targetUser) {

      const targetUserSocketId = targetUser.socketId;
      const callerUserId = Object.keys(users).find(key => users[key].socketId === socket.id);

      io.to(targetUserSocketId).emit("receiving-call", { callerUserId: callerUserId, offer });

    }

  });

  socket.on("answer-call", ({ targetUserId, answer }) => {

    const targetUser = users[targetUserId];

    if (targetUser) {

      const targetUserSocketId = targetUser.socketId;

      io.to(targetUserSocketId).emit("call-answered", { answer });

    }

  });

  socket.on("reconnect-offer", ({targetUserId, offer}) => {

    const targetUser = users[targetUserId];

    if (targetUser) {

      const targetUserSocketId = targetUser.socketId;
      const callerUserId = Object.keys(users).find(key => users[key].socketId === socket.id);

      io.to(targetUserSocketId).emit("reconnect-offer", { callerUserId: callerUserId, offer });

    }

  });

  socket.on("reconnect-answer", ({ targetUserId, answer }) => {

    const targetUser = users[targetUserId];

    if (targetUser) {

      const targetUserSocketId = targetUser.socketId;

      io.to(targetUserSocketId).emit("reconnect-answer", { answer });

    }

  });

  socket.on("end-call", ({ targetUserId }) => {

    const targetUser = users[targetUserId];

    if (targetUser) {

      const targetUserSocketId = targetUser.socketId;

      io.to(targetUserSocketId).emit("call-ended");

    }

  });

  socket.on("ice-candidate", ({ targetUserId, candidate }) => {

    const targetUser = users[targetUserId];

    if (targetUser) {

      const targetUserSocketId = targetUser.socketId;

      io.to(targetUserSocketId).emit("ice-candidate", { candidate });

    }

  });
  
  socket.on("disconnect", () => {

    for (const [userId, user] of Object.entries(users)) {

      if (user.socketId === socket.id) {

        delete users[userId];

        console.log("disconnected:", userId);

        io.emit("users", Object.keys(users));

        break;
        
      }

    }

  });

});

server.listen(3000);