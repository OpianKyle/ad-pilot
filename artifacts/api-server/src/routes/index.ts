import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import campaignsRouter from "./campaigns";
import assetsRouter from "./assets";
import metaRouter from "./meta";
import postsRouter from "./posts";
import aiCreativeRouter from "./ai-creative";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(campaignsRouter);
router.use(metaRouter);
router.use(assetsRouter);
router.use(postsRouter);
router.use(aiCreativeRouter);

export default router;
