import type { RequestHandler } from "express";
import { pdfReportSchemas } from "@Alumni-Tracking-Ss/contracts/reports";
import { requestContext } from "../../../middleware/request-context";
import { validatedInput } from "../../../middleware/validate";
import { pdfReportsService } from "./service";

function send(response: Parameters<RequestHandler>[1], file: { buffer: Buffer; fileName: string }) {
  response
    .status(200)
    .set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    })
    .send(file.buffer);
}

export const pdfReportsController = {
  alumniList: (async (request, response) => {
    const input = validatedInput(request, pdfReportSchemas.alumniList, "query");
    send(response, await pdfReportsService.alumniList(requestContext(request), input));
  }) satisfies RequestHandler,
  profile: (async (request, response) => {
    const input = validatedInput(request, pdfReportSchemas.profile, "params");
    send(response, await pdfReportsService.profile(requestContext(request), input));
  }) satisfies RequestHandler,
  assignments: (async (request, response) => {
    validatedInput(request, pdfReportSchemas.assignments, "query");
    send(response, await pdfReportsService.assignments(requestContext(request)));
  }) satisfies RequestHandler,
};
