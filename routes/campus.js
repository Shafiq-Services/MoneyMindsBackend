const express = require('express');
const router = express.Router();
const {
  createCampus,
  editCampus,
  deleteCampus,
  joinCampus,
  leaveCampus,
  listCampuses,
  getCampusById
} = require('../controllers/campusController');
const authMiddleware = require('../middlewares/auth');
router.use(authMiddleware);

router.get('/list', listCampuses);
router.get('/', getCampusById);
router.post('/join', joinCampus);
router.post('/leave', leaveCampus);

//Admin Routes
router.post('/', createCampus);
router.put('/', editCampus);
router.delete('/', deleteCampus);

module.exports = router; 