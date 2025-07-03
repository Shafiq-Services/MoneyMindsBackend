const express = require('express');
const router = express.Router();

// Watch progress is handled via Socket.IO events, not REST endpoints
// The progress is stored in memory and accessed through existing video endpoints

module.exports = router; 