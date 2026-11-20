import { alumniSchemas } from "@Alumni-Tracking-Ss/contracts/alumni";
import { assignSchemas } from "@Alumni-Tracking-Ss/contracts/faculty";
import { controller } from "../../middleware/controller";
import { alumniService } from "./service";
import { contactsSchemas } from "@Alumni-Tracking-Ss/contracts/contacts";
import { contactsService } from "./contacts.service";
import { timestampEditSchemas } from "@Alumni-Tracking-Ss/contracts/timestamp";
import { beginAlumniTimestampEdit, timestampedService } from "./timestamp-service";

export const alumniController = {
  beginEdit: controller(timestampEditSchemas.begin, beginAlumniTimestampEdit, "body", 201),
  archived: controller(alumniSchemas.archived, alumniService.archived, "query", 200),
  restore: controller(
    alumniSchemas.restore,
    timestampedService("restore", alumniService.restore, "short"),
    "params",
    200,
  ),
  pendingAccounts: controller(
    alumniSchemas.pendingAccounts,
    alumniService.pendingAccounts,
    "query",
    200,
  ),
  list: controller(alumniSchemas.list, alumniService.list, "query", 200),
  get: controller(alumniSchemas.get, alumniService.get, "params", 200),
  create: controller(alumniSchemas.create, alumniService.create, "body", 201),
  update: controller(
    alumniSchemas.update,
    timestampedService("details", alumniService.update),
    "combined",
    200,
  ),
  delete: controller(
    alumniSchemas.delete,
    timestampedService("archive", alumniService.delete, "short"),
    "params",
    200,
  ),
  addEmployment: controller(
    alumniSchemas.addEmployment,
    timestampedService("employment", alumniService.addEmployment),
    "combined",
    201,
  ),
  addTracking: controller(
    alumniSchemas.addTracking,
    timestampedService("tracking", alumniService.addTracking, "short"),
    "combined",
    201,
  ),
  trackingEvents: controller(
    alumniSchemas.trackingEvents,
    alumniService.trackingEvents,
    "paramsQuery",
    200,
  ),
  removePhoto: controller(alumniSchemas.removePhoto, alumniService.removePhoto, "params", 200),
  assign: controller(
    assignSchemas.assign,
    timestampedService("assignment", alumniService.assign),
    "body",
    200,
  ),
  history: controller(alumniSchemas.history, alumniService.history, "params", 200),
  addContact: controller(contactsSchemas.create, contactsService.create, "combined", 201),
  updateContact: controller(contactsSchemas.update, contactsService.update, "combined", 200),
  deleteContact: controller(contactsSchemas.delete, contactsService.delete, "params", 200),
};
