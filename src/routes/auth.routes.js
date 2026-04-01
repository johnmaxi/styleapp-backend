const express    = require("express");
const router     = express.Router();
const auth       = require("../middleware/auth.middleware");
const authController = require("../controllers/auth.controller");

router.post("/register", authController.register);
router.post("/login",    authController.login);
router.get("/me",        auth, authController.me);  // validar token

module.exports = router;
