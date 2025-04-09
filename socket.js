// src/socket.js
import { io } from 'socket.io-client';

const socket = io('http://localhost:4000', {
  withCredentials: true,
  transports: ['polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  timeout: 5000,
});

export default socket;
