// src/routes/bids.routes.js
const express    = require("express");
const router     = express.Router();
const controller = require("../controllers/bids.controller");
const auth       = require("../middleware/auth.middleware");

router.post("/",                  auth, controller.createBid);
router.post("/accept-direct",     auth, controller.acceptDirect);   // NUEVO
router.get("/request/:id",        auth, controller.getByRequest);
router.get("/barber/request/:id", auth, controller.getByRequestForBarber);
router.get("/my-bids",            auth, controller.getMyBids);
router.get("/my-bids/all",        auth, controller.getMyBidsAll);
router.patch("/accept/:bidId",    auth, controller.acceptBid);
router.patch("/reject/:bidId",    auth, controller.rejectBid);

module.exports = router;
