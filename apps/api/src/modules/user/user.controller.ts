import { Request, Response, NextFunction } from "express";
import { UserService } from "./user.service";
import { updateProfileSchema, changePasswordSchema } from "@syncra/validators";

export class UserController {
  static getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await UserService.getProfile(req.user!.userId);
      res.status(200).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  };

  static updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateProfileSchema.parse(req.body);
      const user = await UserService.updateProfile(req.user!.userId, data);
      res.status(200).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  };

  static updateAvatar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { avatarUrl } = req.body;
      if (!avatarUrl || typeof avatarUrl !== "string") {
        throw new Error("Invalid avatarUrl");
      }
      const user = await UserService.updateAvatar(req.user!.userId, avatarUrl);
      res.status(200).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  };

  static changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = changePasswordSchema.parse(req.body);
      await UserService.changePassword(req.user!.userId, data);
      res.status(200).json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  };

  static listSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await UserService.listSessions(req.user!.userId);
      res.status(200).json({ success: true, data: sessions });
    } catch (err) {
      next(err);
    }
  };

  static revokeSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      await UserService.revokeSession(req.user!.userId, id);
      res.status(200).json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  };

  static revokeAllOtherSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await UserService.revokeAllOtherSessions(req.user!.userId, req.user!.sessionId);
      res.status(200).json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  };
}
