import { googleAccessToken } from "./files";
import type { IntegrationEnv } from "../context";

export async function appendSheetRows(
  env: IntegrationEnv,
  values: string[][],
) {
  if (!env.googleServiceAccountJson || !env.googleSheetsSpreadsheetId) {
    throw new Error("Google Sheets is not configured.");
  }

  const token = await googleAccessToken(env.googleServiceAccountJson, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.googleSheetsSpreadsheetId}/values/A1:append?valueInputOption=RAW`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Sheets export failed: ${response.status}`);
  }
}

export async function readSheetRows(env: IntegrationEnv) {
  if (!env.googleServiceAccountJson || !env.googleSheetsSpreadsheetId) {
    throw new Error("Google Sheets is not configured.");
  }

  const token = await googleAccessToken(env.googleServiceAccountJson, [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  ]);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.googleSheetsSpreadsheetId}/values/A1:Z1000`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Google Sheets import failed: ${response.status}`);
  }

  const payload = (await response.json()) as { values?: string[][] };
  return payload.values ?? [];
}
