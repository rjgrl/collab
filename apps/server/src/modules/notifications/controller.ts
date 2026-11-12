import { notificationsSchemas } from "@Alumni-Tracking-Ss/contracts/notifications";
import { controller } from "../../middleware/controller";
import { notificationsService } from "./service";

export const notificationsController = {
  list: controller(notificationsSchemas.list, notificationsService.list, "query", 200),
  markRead: controller(notificationsSchemas.markRead, notificationsService.markRead, "params", 200),
};
