const router = require("express").Router();

//Controllers
const {
  createMarketplace,
  getMarketplaces,
  editMarketplace,
  deleteMarketplace,
} = require("../controllers/marketplace");

//Routes
router.post("/create", createMarketplace);
router.get("/get", getMarketplaces);
router.put("/edit/:id", editMarketplace);
router.delete("/delete/:id", deleteMarketplace);

module.exports = router;
