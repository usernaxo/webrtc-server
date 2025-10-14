import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import maxmind from "maxmind";

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } } );

let users = {};
let cityLookup;
let asnLookup;

(async () => {
  cityLookup = await maxmind.open("./geolocation/GeoLite2-City.mmdb");
  asnLookup = await maxmind.open("./geolocation/GeoLite2-ASN.mmdb");
})();

io.on("connection", (socket) => {

  socket.on("register", async ({ userId, fcmToken }) => {

    if (!userId || userId.trim() === "") return;

    const cleanUserId = userId.trim();
  
    const existing = users[cleanUserId];

    if (existing && existing.socketId !== socket.id) return;

    const existingUserId = Object.keys(users).find(key => users[key].socketId === socket.id);

    if (existingUserId && existingUserId !== cleanUserId) delete users[existingUserId];
  
    const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || "Unknown";

    const ua = (socket.handshake.headers['user-agent'] || "").toLowerCase();

    let agent = "unknown";

    if (ua.includes("firefox")) agent = "firefox";
    else if (ua.includes("chrome")) agent = "chrome";
    else if (ua.includes("safari")) agent = "safari";
    else if (ua.includes("android")) agent = "android";
    else if (ua.includes("iphone") || ua.includes("ipad")) agent = "ios";

    let city = "Unknown", region = "Unknown", country = "Unknown", isp = "Unknown";

    try {

      const cityData = cityLookup.get(ip) || {};
      const asnData = asnLookup.get(ip) || {};

      city = cityData.city?.names?.en || "Unknown";
      region = cityData.subdivisions?.[0]?.names?.en || "Unknown";
      country = cityData.country?.names?.en || "Unknown";
      isp = asnData.autonomous_system_organization || "Unknown";

    } catch (e) {

      console.log(e.message);

    }

    users[cleanUserId] = {
      socketId: socket.id,
      fcmToken,
      ip,
      city,
      region,
      country,
      isp,
      agent
    };
  
    console.log("registered:", cleanUserId, agent, ip, city, region, country, isp);

    io.emit("users", Object.values(users).map(u => ({
      userId: cleanUserId,
      agent: u.agent,
      city: u.city,
      region: u.region,
      country: u.country,
      isp: u.isp
    })));

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