const router = require("express").Router();

//Controllers
const {
  createBanner,
  getBanners,
  getActiveBanner,
  editBanner,
  toggleBannerActive,
  deleteBanner,
} = require("../controllers/banner");

//Routes
router.post("/create", createBanner);
router.get("/get", getBanners);
router.get("/active", getActiveBanner);
router.put("/edit", editBanner);
router.put("/activate", toggleBannerActive);
router.delete("/delete", deleteBanner);

module.exports = router;
