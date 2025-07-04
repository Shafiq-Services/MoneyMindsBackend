const router = require("express").Router();

//Controllers
const {
  createBanner,
  getBanners,
  editBanner,
  deleteBanner,
} = require("../controllers/banner");

//Routes
router.post("/create", createBanner);
router.get("/get", getBanners);
router.put("/edit/:id", editBanner);
router.delete("/delete/:id", deleteBanner);

module.exports = router;
